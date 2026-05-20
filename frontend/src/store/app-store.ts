'use client';
import { create } from 'zustand';

type View =
  | 'dashboard'
  | 'chats'
  | 'commands'
  | 'models'
  | 'connections'
  | 'telegram'
  | 'reminders'
  | 'autoreply'
  | 'logs'
  | 'settings';

type State = {
  view: View;
  setView: (v: View) => void;
  selectedChatId: string | null;
  selectChat: (id: string | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;
};

export const useAppStore = create<State>((set) => ({
  view: 'dashboard',
  setView: (view) => set({ view, sidebarOpen: false }),
  selectedChatId: null,
  selectChat: (id) => set({ selectedChatId: id }),
  sidebarOpen: false,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
