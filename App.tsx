
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MoodTracker } from './components/MoodTracker';
import { CycleTracker } from './components/CycleTracker';
import { Calendar } from './components/Calendar';
import { MoodSummary } from './components/MoodSummary';
import { SettingsIcon, CalendarDaysIcon, SignOutIcon } from './components/Icons';
import { DailyAffirmation } from './components/DailyAffirmation';
import { Mood, CycleFlow, DailyEntry } from './types';
import { getFormattedDate, isSameDay, isFutureDate } from './utils/dateUtils';
import { useLanguage } from './contexts/LanguageContext';
import { predictFutureCycles, type CyclePredictions } from './utils/predictions';
import { YearView } from './components/YearView';
import { Profile } from './components/Profile';
import { Practices } from './components/Practices';
import { SimpleHeader } from './components/SimpleHeader';
import { BottomTabBar, type TabType } from './components/BottomTabBar';
import { AIChatBot } from './components/AIChatBot';
import { useAuth } from './contexts/AuthContext';
import { Login } from './components/Login';
import { db } from './lib/firebase';
import { getPracticeSyncService, destroyPracticeSyncService } from './lib/practiceSync';
import './lib/spacing.css';

declare const firebase: any;
const GUEST_DATA_KEY = 'moodTrackerGuestData';

// Add RTL support styles and bottom safe area padding
const rtlStyles = `
  .rtl {
    direction: rtl;
  }
  .rtl .text-left {
    text-align: right;
  }
  .rtl .text-right {
    text-align: left;
  }
  .rtl .ml-auto {
    margin-left: 0;
    margin-right: auto;
  }
  .rtl .mr-auto {
    margin-right: 0;
    margin-left: auto;
  }
  .rtl .flex-row {
    flex-direction: row-reverse;
  }
  .rtl .space-x-1 > * + * {
    margin-left: 0;
    margin-right: 0.25rem;
  }
  .rtl .space-x-2 > * + * {
    margin-left: 0;
    margin-right: 0.5rem;
  }
  
  /* Top safe area padding for status bar / notch */
  .safe-top {
    padding-top: env(safe-area-inset-top);
  }
  
  /* Safe area for practice headers - ensures back button is below status bar */
  .practice-header {
    padding-top: max(1rem, env(safe-area-inset-top));
    padding-bottom: 0.5rem;
  }
  
  /* Bottom safe area padding for fixed navigation bar */
  /* Tab bar height: ~80px (64px special tab + 16px padding) + safe area */
  .safe-bottom {
    padding-bottom: calc(5.5rem + env(safe-area-inset-bottom));
  }
  
  /* Ensure scrollable content respects bottom navigation */
  .scroll-container {
    padding-bottom: calc(5.5rem + env(safe-area-inset-bottom));
  }
  
  /* Ensure inputs scroll into view when keyboard opens */
  @supports (padding: max(0px)) {
    .safe-bottom {
      padding-bottom: max(5.5rem, calc(5.5rem + env(safe-area-inset-bottom)));
    }
  }
  .rtl .space-x-4 > * + * {
    margin-left: 0;
    margin-right: 1rem;
  }

  /* Header animations */
  @keyframes headerFadeIn {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

// Inject RTL styles
const styleSheet = document.createElement('style');
styleSheet.textContent = rtlStyles;
document.head.appendChild(styleSheet);

const UserAvatar: React.FC<{ user: NonNullable<ReturnType<typeof useAuth>['user']> }> = ({ user }) => {
  if (user.photoURL) {
    return <img src={user.photoURL} alt="User" className="w-10 h-10 rounded-full shadow-md" />;
  }

  const initials = user.isAnonymous || !user.email
    ? 'GU'
    : user.email.substring(0, 2).toUpperCase();

  return (
    <div
      className="w-10 h-10 rounded-full shadow-md bg-purple-500 flex items-center justify-center text-white font-bold text-sm"
      title={user.isAnonymous ? 'Guest' : user.email ?? ''}
      aria-label={`User: ${user.isAnonymous ? 'Guest' : user.email}`}
    >
      {initials}
    </div>
  );
};


const App: React.FC = () => {
  const { user, loading: authLoading, signOutUser } = useAuth();
  const { t, locale, isRTL } = useLanguage();

  const [isDataLoading, setIsDataLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dailyData, setDailyData] = useState<Record<string, DailyEntry>>({});

  const [activeTab, setActiveTab] = useState<TabType>('log');
  const [showCycleTracker, setShowCycleTracker] = useState<boolean>(true);
  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(false);
  const [notificationPermission, setNotificationPermission] = useState('Notification' in window ? Notification.permission : 'denied');

  // Fetch data from Firestore or localStorage when user changes
  useEffect(() => {
    if (!user) {
      setDailyData({});
      setShowCycleTracker(true);
      setRemindersEnabled(false);
      setIsDataLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsDataLoading(true);
      try {
        if (user.isAnonymous) {
          // GUEST MODE: Load from localStorage
          const guestDataRaw = localStorage.getItem(GUEST_DATA_KEY);
          if (guestDataRaw) {
            const guestData = JSON.parse(guestDataRaw);
            setShowCycleTracker(guestData.settings?.showCycleTracker ?? true);
            setRemindersEnabled(guestData.settings?.remindersEnabled ?? false);
            setDailyData(guestData.dailyData || {});
          } else {
            // Default state for new guest user
            setShowCycleTracker(true);
            setRemindersEnabled(false);
            setDailyData({});
          }
        } else {
          // AUTHENTICATED USER: Load from Firestore
          const settingsDoc = await db.collection('users').doc(user.uid).collection('settings').doc('main').get();
          if (settingsDoc.exists) {
            const settings = settingsDoc.data();
            setShowCycleTracker(settings?.showCycleTracker ?? true);
            setRemindersEnabled(settings?.remindersEnabled ?? false);
          }

          const entriesSnapshot = await db.collection('users').doc(user.uid).collection('entries').get();
          const entriesData: Record<string, DailyEntry> = {};
          entriesSnapshot.forEach((doc: any) => {
            entriesData[doc.id] = doc.data() as DailyEntry;
          });
          setDailyData(entriesData);

          // Initialize practice sync for authenticated users
          const syncService = getPracticeSyncService(user.uid);
          await syncService.initialSync();
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setIsDataLoading(false);
      }
    };

    fetchData();

    // Cleanup function
    return () => {
      if (user?.uid) {
        // Clean up sync service when user changes or component unmounts
        destroyPracticeSyncService(user.uid);
      }
    };
  }, [user]);

  const predictions = useMemo((): CyclePredictions => {
    if (!showCycleTracker) {
      const emptyPredictions: CyclePredictions = { period: new Set<string>(), fertile: new Set<string>(), ovulation: new Set<string>() };
      return emptyPredictions;
    }
    const predictionEndDate = new Date();
    predictionEndDate.setFullYear(predictionEndDate.getFullYear() + 1);
    return predictFutureCycles(dailyData, predictionEndDate);
  }, [dailyData, showCycleTracker]);

  const handleToggleCycleTracker = useCallback(async (enabled: boolean) => {
    setShowCycleTracker(enabled);
    if (user) {
      if (user.isAnonymous) {
        const guestDataRaw = localStorage.getItem(GUEST_DATA_KEY);
        const guestData = guestDataRaw ? JSON.parse(guestDataRaw) : { settings: {}, dailyData };
        guestData.settings.showCycleTracker = enabled;
        localStorage.setItem(GUEST_DATA_KEY, JSON.stringify(guestData));
      } else {
        try {
          await db.collection('users').doc(user.uid).collection('settings').doc('main').set({ showCycleTracker: enabled }, { merge: true });
        } catch (error) {
          console.error("Error saving cycle tracker setting:", error);
        }
      }
    }
  }, [user, dailyData]);

  useEffect(() => {
    let timeoutId: number | undefined;
    const scheduleNotification = () => {
      // ... (notification logic remains the same)
    };

    if (remindersEnabled && notificationPermission === 'granted') {
      scheduleNotification();
    }
    return () => { if (timeoutId) clearTimeout(timeoutId); };
  }, [remindersEnabled, notificationPermission, t.notificationTitle, t.notificationBody]);

  const handleToggleReminders = useCallback(async (enabled: boolean) => {
    let finalEnabledState = enabled;
    if (enabled) {
      if (notificationPermission === 'granted') {
        setRemindersEnabled(true);
      } else if (notificationPermission === 'default') {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === 'granted') {
          setRemindersEnabled(true);
        } else {
          finalEnabledState = false;
        }
      } else {
        finalEnabledState = false;
      }
    } else {
      setRemindersEnabled(false);
    }

    if (user) {
      if (user.isAnonymous) {
        const guestDataRaw = localStorage.getItem(GUEST_DATA_KEY);
        const guestData = guestDataRaw ? JSON.parse(guestDataRaw) : { settings: {}, dailyData };
        guestData.settings.remindersEnabled = finalEnabledState;
        localStorage.setItem(GUEST_DATA_KEY, JSON.stringify(guestData));
      } else {
        try {
          await db.collection('users').doc(user.uid).collection('settings').doc('main').set({ remindersEnabled: finalEnabledState }, { merge: true });
        } catch (error) {
          console.error("Error saving reminders setting:", error);
        }
      }
    }
  }, [user, notificationPermission, dailyData]);

  const formattedSelectedDate = getFormattedDate(selectedDate);
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<CycleFlow | null>(null);
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    const entry = dailyData[getFormattedDate(selectedDate)];
    setSelectedMood(entry?.mood || null);
    setSelectedCycle(entry?.cycle || null);
    setNote(entry?.note || '');
  }, [selectedDate, dailyData]);

  const handleSaveEntry = async () => {
    if (!user || !selectedMood) return;
    const entryData: DailyEntry = {
      mood: selectedMood,
      cycle: showCycleTracker ? selectedCycle : null,
    };
    if (note.trim()) {
      entryData.note = note.trim();
    }

    const updatedDailyData = { ...dailyData, [formattedSelectedDate]: { ...dailyData[formattedSelectedDate], ...entryData } };
    setDailyData(updatedDailyData);

    if (user.isAnonymous) {
      const guestDataRaw = localStorage.getItem(GUEST_DATA_KEY);
      const guestData = guestDataRaw ? JSON.parse(guestDataRaw) : { settings: { showCycleTracker, remindersEnabled }, dailyData: {} };
      guestData.dailyData = updatedDailyData;
      localStorage.setItem(GUEST_DATA_KEY, JSON.stringify(guestData));
    } else {
      const docRef = db.collection('users').doc(user.uid).collection('entries').doc(formattedSelectedDate);
      try {
        await docRef.set(entryData, { merge: true });
      } catch (error) {
        console.error("Error saving entry to Firestore:", error);
        setDailyData(dailyData); // Revert on error
      }
    }
  };

  const handleUpdateMood = async (date: Date, mood: Mood) => {
    if (!user) return;
    const formattedDate = getFormattedDate(date);
    const updatedDailyData = {
      ...dailyData,
      [formattedDate]: {
        mood: mood,
        cycle: dailyData[formattedDate]?.cycle ?? null,
        note: dailyData[formattedDate]?.note,
      }
    };
    setDailyData(updatedDailyData);

    if (user.isAnonymous) {
      const guestDataRaw = localStorage.getItem(GUEST_DATA_KEY);
      const guestData = guestDataRaw ? JSON.parse(guestDataRaw) : { settings: { showCycleTracker, remindersEnabled }, dailyData: {} };
      guestData.dailyData = updatedDailyData;
      localStorage.setItem(GUEST_DATA_KEY, JSON.stringify(guestData));
    } else {
      const docRef = db.collection('users').doc(user.uid).collection('entries').doc(formattedDate);
      try {
        await docRef.set({ mood }, { merge: true });
      } catch (error) {
        console.error("Error updating mood in Firestore:", error);
        setDailyData(dailyData); // Revert on error
      }
    }
  };

  const handleUpdateCycle = async (date: Date, cycle: CycleFlow | null) => {
    if (!user) return;
    const formattedDate = getFormattedDate(date);
    const updatedDailyData = {
      ...dailyData,
      [formattedDate]: {
        mood: dailyData[formattedDate]?.mood ?? Mood.Okay,
        cycle: cycle,
        note: dailyData[formattedDate]?.note,
      }
    };
    setDailyData(updatedDailyData);

    if (user.isAnonymous) {
      const guestDataRaw = localStorage.getItem(GUEST_DATA_KEY);
      const guestData = guestDataRaw ? JSON.parse(guestDataRaw) : { settings: { showCycleTracker, remindersEnabled }, dailyData: {} };
      guestData.dailyData = updatedDailyData;
      localStorage.setItem(GUEST_DATA_KEY, JSON.stringify(guestData));
    } else {
      const docRef = db.collection('users').doc(user.uid).collection('entries').doc(formattedDate);
      try {
        await docRef.set({ cycle }, { merge: true });
      } catch (error) {
        console.error("Error updating cycle in Firestore:", error);
        setDailyData(dailyData); // Revert on error
      }
    }
  };

  const handleDeleteEntry = async () => {
    if (!user || !dailyData[formattedSelectedDate]) return;
    const updatedDailyData = { ...dailyData };
    delete updatedDailyData[formattedSelectedDate];
    setDailyData(updatedDailyData);

    if (user.isAnonymous) {
      const guestDataRaw = localStorage.getItem(GUEST_DATA_KEY);
      const guestData = guestDataRaw ? JSON.parse(guestDataRaw) : { settings: { showCycleTracker, remindersEnabled }, dailyData: {} };
      guestData.dailyData = updatedDailyData;
      localStorage.setItem(GUEST_DATA_KEY, JSON.stringify(guestData));
    } else {
      try {
        await db.collection('users').doc(user.uid).collection('entries').doc(formattedSelectedDate).delete();
      } catch (error) {
        console.error("Error deleting entry from Firestore:", error);
        setDailyData(dailyData); // Revert on error
      }
    }
  };

  const handleImportData = async (data: { settings: { showCycleTracker: boolean; remindersEnabled: boolean; }; dailyData: Record<string, DailyEntry>; }) => {
    if (!user) return;

    if (!window.confirm(t.importWarningMessage)) return;

    setIsDataLoading(true);
    try {
      if (user.isAnonymous) {
        localStorage.setItem(GUEST_DATA_KEY, JSON.stringify(data));
      } else {
        const { settings, dailyData: importedData } = data;
        const batch = db.batch();

        const entriesRef = db.collection('users').doc(user.uid).collection('entries');
        const oldEntriesSnapshot = await entriesRef.get();
        oldEntriesSnapshot.forEach((doc: any) => batch.delete(doc.ref));

        Object.entries(importedData).forEach(([date, entry]) => {
          const docRef = entriesRef.doc(date);
          batch.set(docRef, entry);
        });

        const settingsRef = db.collection('users').doc(user.uid).collection('settings').doc('main');
        batch.set(settingsRef, settings, { merge: true });

        await batch.commit();
      }

      // Update local state for both user types
      setDailyData(data.dailyData);
      setShowCycleTracker(data.settings.showCycleTracker);
      setRemindersEnabled(data.settings.remindersEnabled);
      setShowSettings(false); // Close settings modal on success

    } catch (error) {
      console.error("Error importing data:", error);
      alert(t.importError);
    } finally {
      setIsDataLoading(false);
    }
  };

  const isToday = isSameDay(selectedDate, new Date());
  const isFuture = isFutureDate(selectedDate);
  const entryExists = !!dailyData[formattedSelectedDate];

  if (authLoading || isDataLoading) {
    return (
      <div className="bg-gradient-to-b from-sky-50 to-cyan-100 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className={`bg-gradient-to-b from-sky-50 to-cyan-100 min-h-screen font-sans space-compact ${isRTL ? 'rtl' : 'ltr'}`}>
      <div className="container mx-auto p-4 sm:p-5 lg:p-6 max-w-5xl safe-bottom">
        {activeTab === 'log' && (
          <>
            <DailyAffirmation />
            <div className="mb-4"></div>
            <header className="py-2 mb-2">
              <div className="text-center">
                <h1
                  className="font-bold text-purple-400 leading-tight inline-block max-w-full"
                  style={{
                    fontSize: 'clamp(1.5rem, 5vw, 3rem)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: 'max-content',
                    animation: 'headerFadeIn 250ms ease-out forwards',
                    opacity: 0,
                    transform: 'translateY(4px)'
                  }}
                >
                  <span className="inline-block">
                    {t.title_part1}
                    {showCycleTracker && (
                      <span
                        className="font-handwritten text-red-500 font-normal inline"
                        style={{
                          fontSize: 'clamp(1.5rem, 5vw, 3rem)',
                        }}
                      >
                        {' '}{t.title_part2_cycle}
                      </span>
                    )}
                    {t.title_part3 && <span className="inline">{' '}{t.title_part3}</span>}
                  </span>
                </h1>
                <p
                  className="text-slate-500 text-base sm:text-lg leading-relaxed break-words max-w-2xl mx-auto px-4 mt-2"
                  style={{
                    animation: 'headerFadeIn 250ms ease-out 100ms forwards',
                    opacity: 0,
                    transform: 'translateY(4px)'
                  }}
                >
                  {t.subtitle}
                </p>
              </div>
            </header>
          </>
        )}

        {activeTab === 'practices' && (
          <Practices />
        )}

        {activeTab === 'log' && (
          <main className="grid grid-cols-1 lg:grid-cols-3 gap-cards safe-bottom screen-padding">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-compact card-padding relative">
                {user.isAnonymous && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-yellow-300 text-yellow-800 text-xs font-bold px-3 py-1 rounded-full shadow">
                    GUEST MODE - Data is saved on this device only
                  </div>
                )}
                <h2 className="text-lg sm:text-xl font-bold text-slate-700 gap-heading text-compact leading-tight break-words">
                  {t.howAreYouFeeling.replace('{date}', selectedDate.toLocaleDateString(locale, { month: 'long', day: 'numeric' }))}
                </h2>
                <p className="text-sm text-slate-500 gap-heading text-compact">
                  {isToday
                    ? ""
                    : isFuture
                      ? t.logFutureError
                      : t.viewingPastEntry}
                </p>
                <MoodTracker selectedMood={selectedMood} onSelect={setSelectedMood} />

                {showCycleTracker && (
                  <>
                    <div className="my-2 border-t border-slate-200"></div>
                    <CycleTracker
                      selectedCycle={selectedCycle}
                      onSelect={setSelectedCycle}
                      dailyData={dailyData}
                      predictions={predictions}
                    />
                  </>
                )}

                <div className="mt-3">
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={isFuture ? t.addNotePlaceholderFuture : t.addNotePlaceholder}
                    disabled={isFuture}
                    className="w-full input-compact bg-slate-100 rounded-lg border-2 border-transparent focus:ring-2 focus:ring-purple-400 focus:bg-white transition-all duration-200 disabled:bg-slate-50 disabled:cursor-not-allowed text-slate-700 touch-target"
                    aria-label="Daily note"
                  />
                </div>

                <div className="mt-6 text-center flex flex-row justify-center items-center gap-3">
                  {selectedMood && (
                    <button
                      onClick={handleSaveEntry}
                      disabled={isFuture}
                      className="bg-purple-600 text-white font-bold py-3 px-4 sm:px-6 lg:px-8 rounded-full hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all duration-200 shadow-lg transform hover:scale-105 disabled:bg-slate-400 disabled:cursor-not-allowed disabled:transform-none min-w-[120px] max-w-[200px] text-sm sm:text-base break-words leading-tight"
                      aria-label={entryExists ? t.updateEntryAria.replace('{date}', selectedDate.toLocaleDateString(locale)) : t.saveEntryAria.replace('{date}', selectedDate.toLocaleDateString(locale))}
                    >
                      {entryExists ? t.updateEntry : t.saveEntry}
                    </button>
                  )}
                  {entryExists && (
                    <button
                      onClick={handleDeleteEntry}
                      disabled={isFuture}
                      className="bg-red-600 text-white font-bold py-3 px-4 sm:px-6 lg:px-8 rounded-full hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200 shadow-lg transform hover:scale-105 disabled:bg-slate-400 disabled:cursor-not-allowed disabled:transform-none min-w-[120px] max-w-[200px] text-sm sm:text-base break-words leading-tight"
                      aria-label={t.deleteEntryAria.replace('{date}', selectedDate.toLocaleDateString(locale))}
                    >
                      {t.deleteEntry}
                    </button>
                  )}
                </div>
              </div>

              <Calendar
                selectedDate={selectedDate}
                onDateSelect={setSelectedDate}
                onUpdateMood={handleUpdateMood}
                onUpdateCycle={handleUpdateCycle}
                dailyData={dailyData}
                showCycleTracker={showCycleTracker}
                predictions={predictions}
              />
            </div>

            <div className="lg:col-span-1">
              <MoodSummary dailyData={dailyData} />
            </div>
          </main>
        )}

        {activeTab === 'year' && (
          <>
            <SimpleHeader title={t.yearOverviewTitle || 'Year Overview'} />
            <YearView dailyData={dailyData} onBack={() => setActiveTab('log')} />
          </>
        )}

        {activeTab === 'profile' && (
          <>
            <SimpleHeader title={t.profileTitle || 'Profile'} />
            <Profile
              showCycleTracker={showCycleTracker}
              onToggleCycleTracker={handleToggleCycleTracker}
              remindersEnabled={remindersEnabled}
              onToggleReminders={handleToggleReminders}
              notificationPermission={notificationPermission}
              dailyData={dailyData}
              onImportData={handleImportData}
            />
          </>
        )}

        <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <AIChatBot dailyData={dailyData} />
      </div>
    </div>
  );
};

export default App;
