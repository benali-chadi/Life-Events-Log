import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { useAppToast } from '@/components/ui/AppToastProvider';
import {
  useDeleteEventMutation,
  useDeleteManyEventsMutation,
} from '@/data/query';
import type { UUID } from '@/models';

type DeletableEvent = {
  id: UUID;
  title: string;
};

type EventDeletionContextValue = {
  deleteEvent: (event: DeletableEvent) => Promise<void>;
  deleteEvents: (events: readonly DeletableEvent[]) => Promise<void>;
  pendingEventIds: ReadonlySet<UUID>;
  isDeletingEvents: boolean;
};

const EventDeletionContext = createContext<EventDeletionContextValue | null>(
  null
);

const DELETE_DELAY_MS = 5000;

export default function EventDeletionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { dismissToast, showToast } = useAppToast();
  const deleteEventMutation = useDeleteEventMutation();
  const deleteManyEventsMutation = useDeleteManyEventsMutation();
  const [pendingEvents, setPendingEvents] = useState<DeletableEvent[]>([]);
  const pendingEventsRef = useRef<readonly DeletableEvent[]>([]);
  const finalizingRef = useRef<Promise<boolean> | null>(null);
  const toastIdRef = useRef<number | null>(null);

  const updatePendingEvents = useCallback(
    (events: readonly DeletableEvent[]) => {
      pendingEventsRef.current = events;
      setPendingEvents([...events]);
    },
    []
  );

  const finalizePending = useCallback(() => {
    if (finalizingRef.current) return finalizingRef.current;

    const events = pendingEventsRef.current;
    if (events.length === 0) return Promise.resolve(true);

    if (toastIdRef.current !== null) {
      dismissToast(toastIdRef.current);
      toastIdRef.current = null;
    }

    const operation = (
      events.length === 1
        ? deleteEventMutation.mutateAsync(events[0]!.id)
        : deleteManyEventsMutation.mutateAsync(events.map((event) => event.id))
    )
      .then(() => {
        if (pendingEventsRef.current === events) updatePendingEvents([]);
        return true;
      })
      .catch(() => {
        if (pendingEventsRef.current === events) updatePendingEvents([]);
        showToast({
          message: `The ${events.length === 1 ? 'event was' : 'events were'} not deleted. Please try again.`,
          kind: 'error',
        });
        return false;
      })
      .finally(() => {
        finalizingRef.current = null;
      });

    finalizingRef.current = operation;
    return operation;
  }, [
    deleteEventMutation,
    deleteManyEventsMutation,
    dismissToast,
    showToast,
    updatePendingEvents,
  ]);

  const scheduleDeletion = useCallback(
    async (events: readonly DeletableEvent[]) => {
      if (events.length === 0) return;
      if (pendingEventsRef.current.length > 0) {
        const finalized = await finalizePending();
        if (!finalized) return;
      }

      updatePendingEvents(events);
      toastIdRef.current = showToast({
        message:
          events.length === 1
            ? `Delete “${events[0]!.title}”?`
            : `Delete ${events.length} events?`,
        duration: DELETE_DELAY_MS,
        showProgress: true,
        actions: [
          {
            label: 'Undo',
            onPress: () => updatePendingEvents([]),
          },
          {
            label: 'Delete now',
            tone: 'destructive',
            onPress: () => finalizePending(),
          },
        ],
        onDismiss: (reason) => {
          toastIdRef.current = null;
          if (reason === 'timeout' || reason === 'replaced') {
            void finalizePending();
          }
        },
      });
    },
    [finalizePending, showToast, updatePendingEvents]
  );

  const pendingEventIds = new Set(pendingEvents.map((event) => event.id));

  return (
    <EventDeletionContext.Provider
      value={{
        deleteEvent: (event) => scheduleDeletion([event]),
        deleteEvents: scheduleDeletion,
        pendingEventIds,
        isDeletingEvents:
          deleteEventMutation.isPending || deleteManyEventsMutation.isPending,
      }}
    >
      {children}
    </EventDeletionContext.Provider>
  );
}

export function useEventDeletion() {
  const context = useContext(EventDeletionContext);

  if (!context) {
    throw new Error(
      'useEventDeletion must be used inside EventDeletionProvider'
    );
  }

  return context;
}
