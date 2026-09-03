import { createContext, type ReactNode, useCallback, useContext } from 'react';
import { useAppToast } from '@/components/ui/AppToastProvider';
import {
  useDeleteEventMutation,
  useDeleteManyEventsMutation,
  useRestoreEventMutation,
  useRestoreManyEventsMutation,
} from '@/data/query';
import type { UUID } from '@/models';

type DeletableEvent = {
  id: UUID;
  title: string;
};

type EventDeletionContextValue = {
  deleteEvent: (event: DeletableEvent) => Promise<void>;
  deleteEvents: (events: readonly DeletableEvent[]) => Promise<void>;
  isDeletingEvents: boolean;
};

const EventDeletionContext = createContext<EventDeletionContextValue | null>(
  null
);

const UNDO_WINDOW_MS = 5000;

export default function EventDeletionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { showToast } = useAppToast();
  const deleteEventMutation = useDeleteEventMutation();
  const deleteManyEventsMutation = useDeleteManyEventsMutation();
  const restoreEventMutation = useRestoreEventMutation();
  const restoreManyEventsMutation = useRestoreManyEventsMutation();

  const restoreEvents = useCallback(
    async (events: readonly DeletableEvent[]) => {
      try {
        if (events.length === 1) {
          await restoreEventMutation.mutateAsync(events[0]!.id);
        } else {
          await restoreManyEventsMutation.mutateAsync(
            events.map((event) => event.id)
          );
        }
      } catch {
        showToast({
          message: `The ${events.length === 1 ? 'event' : 'events'} could not be restored. Please try again.`,
          kind: 'error',
        });
      }
    },
    [restoreEventMutation, restoreManyEventsMutation, showToast]
  );

  const showDeletionToast = useCallback(
    (events: readonly DeletableEvent[]) => {
      showToast({
        message:
          events.length === 1
            ? 'Event deleted'
            : `${events.length} events deleted`,
        duration: UNDO_WINDOW_MS,
        showProgress: true,
        actions: [
          {
            label: 'Undo',
            onPress: () => restoreEvents(events),
          },
        ],
      });
    },
    [restoreEvents, showToast]
  );

  const deleteEvent = useCallback(
    async (event: DeletableEvent) => {
      await deleteEventMutation.mutateAsync(event.id);
      showDeletionToast([event]);
    },
    [deleteEventMutation, showDeletionToast]
  );

  const deleteEvents = useCallback(
    async (events: readonly DeletableEvent[]) => {
      if (events.length === 0) return;
      await deleteManyEventsMutation.mutateAsync(
        events.map((event) => event.id)
      );
      showDeletionToast(events);
    },
    [deleteManyEventsMutation, showDeletionToast]
  );

  return (
    <EventDeletionContext.Provider
      value={{
        deleteEvent,
        deleteEvents,
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
