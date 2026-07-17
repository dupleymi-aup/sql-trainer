import { useEffect } from 'react';
import { useSQLTrainerStore } from '@/lib/store';
import { getNextHintLevel, generateProgressiveHints, calculateHintPenalty } from '@/lib/progressive-hints';
import { t } from '@/lib/i18n';
import { formatSQL } from '@/components/sql-editor';
import type { TrainingTask } from '@/lib/training-tasks';

interface UseKeyboardShortcutsOptions {
  executeQuery: () => void;
  executeVerify?: () => void;
  hintLevel: number;
  setHintLevel: (level: 0 | 1 | 2 | 3) => void;
  solutionVisible: boolean;
  setSolutionVisible: (visible: boolean) => void;
  setEditorContent: (content: string) => void;
  setLastResult: (result: null) => void;
  setVerification: (v: null) => void;
  setTotalHintPenalty: (penalty: number) => void;
  editorContent: string;
  currentTask: TrainingTask | null | undefined;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  theme: string;
  toggleBookmark: (taskId: string) => void;
  currentTaskId: string | null;
}

export function useKeyboardShortcuts({
  executeQuery,
  executeVerify,
  hintLevel,
  setHintLevel,
  solutionVisible,
  setSolutionVisible,
  setEditorContent,
  setLastResult,
  setVerification,
  setTotalHintPenalty,
  editorContent,
  currentTask,
  sidebarOpen,
  setSidebarOpen,
  theme,
  toggleBookmark,
  currentTaskId,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeQuery();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        setEditorContent('');
        setLastResult(null);
        setVerification(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        const nextLevel = getNextHintLevel(hintLevel);
        if (nextLevel !== null && currentTask) {
          setHintLevel(nextLevel);
          const hints = generateProgressiveHints(
            currentTask.id,
            currentTask.hint,
            currentTask.taskText,
            currentTask.progressiveHints,
          );
          setTotalHintPenalty(calculateHintPenalty(hints, nextLevel));
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        setSolutionVisible(!solutionVisible);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setEditorContent(formatSQL(editorContent));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen(!sidebarOpen);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        if (currentTaskId) toggleBookmark(currentTaskId);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        executeQuery();
        if (currentTaskId) executeVerify?.();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') {
        e.preventDefault();
        const { clearHistory } = useSQLTrainerStore.getState();
        if (window.confirm(t('action.clearHistoryConfirm', { default: 'Clear query history?' }))) {
          clearHistory();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        const cycle: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
        const idx = cycle.indexOf((theme as 'light' | 'dark' | 'system') || 'system');
        const next = cycle[(idx + 1) % cycle.length];
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('next-theme', next);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    executeQuery,
    executeVerify,
    hintLevel,
    setHintLevel,
    solutionVisible,
    setSolutionVisible,
    setEditorContent,
    setLastResult,
    setVerification,
    setTotalHintPenalty,
    editorContent,
    currentTask,
    sidebarOpen,
    setSidebarOpen,
    theme,
    toggleBookmark,
    currentTaskId,
  ]);
}
