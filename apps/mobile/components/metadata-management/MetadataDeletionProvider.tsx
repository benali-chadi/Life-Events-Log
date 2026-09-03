import { useNavigation } from 'expo-router';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAppToast } from '@/components/ui/AppToastProvider';
import {
  useDeleteCategoryMutation,
  useDeleteLocationMutation,
  useDeleteManyCategoriesMutation,
  useDeleteManyLocationsMutation,
  useDeleteManyPeopleMutation,
  useDeleteManyTagsMutation,
  useDeletePersonMutation,
  useDeleteTagMutation,
} from '@/data/query';
import type { UUID } from '@/models';
import {
  confirmManyMetadataDeletion,
  confirmMetadataDeletion,
} from './confirmMetadataDeletion';

export type MetadataDeletionKind = 'category' | 'tag' | 'person' | 'location';

export type PendingMetadataDeletion = {
  kind: MetadataDeletionKind;
  id: UUID;
  name: string;
  eventCount: number;
};

type PendingMetadataOperation =
  | { type: 'single'; item: PendingMetadataDeletion }
  | {
      type: 'many';
      kind: MetadataDeletionKind;
      ids: readonly UUID[];
      label: string;
    };

type MetadataDeletionContextValue = {
  pendingKind: MetadataDeletionKind | null;
  pendingIds: ReadonlySet<UUID>;
  requestDeletion: (
    metadata: PendingMetadataDeletion,
    onConfirmed?: () => void
  ) => void;
  requestManyDeletions: (
    metadata: readonly PendingMetadataDeletion[],
    label: string,
    onConfirmed?: () => void
  ) => void;
  finalizePending: () => Promise<boolean>;
};

const MetadataDeletionContext =
  createContext<MetadataDeletionContextValue | null>(null);

const DELETE_DELAY_MS = 5000;

export default function MetadataDeletionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { dismissToast, showToast } = useAppToast();
  const navigation = useNavigation();
  const deleteCategory = useDeleteCategoryMutation();
  const deleteTag = useDeleteTagMutation();
  const deletePerson = useDeletePersonMutation();
  const deleteLocation = useDeleteLocationMutation();
  const deleteCategories = useDeleteManyCategoriesMutation();
  const deleteTags = useDeleteManyTagsMutation();
  const deletePeople = useDeleteManyPeopleMutation();
  const deleteLocations = useDeleteManyLocationsMutation();
  const [pending, setPending] = useState<PendingMetadataOperation | null>(null);
  const pendingRef = useRef<PendingMetadataOperation | null>(null);
  const finalizingRef = useRef<Promise<boolean> | null>(null);
  const toastIdRef = useRef<number | null>(null);
  const allowNavigationRef = useRef(false);

  const updatePending = useCallback(
    (operation: PendingMetadataOperation | null) => {
      pendingRef.current = operation;
      setPending(operation);
    },
    []
  );

  const deleteOperation = useCallback(
    (operation: PendingMetadataOperation) => {
      if (operation.type === 'many') {
        switch (operation.kind) {
          case 'category':
            return deleteCategories.mutateAsync(operation.ids);
          case 'tag':
            return deleteTags.mutateAsync(operation.ids);
          case 'person':
            return deletePeople.mutateAsync(operation.ids);
          case 'location':
            return deleteLocations.mutateAsync(operation.ids);
        }
      }

      switch (operation.item.kind) {
        case 'category':
          return deleteCategory.mutateAsync(operation.item.id);
        case 'tag':
          return deleteTag.mutateAsync(operation.item.id);
        case 'person':
          return deletePerson.mutateAsync(operation.item.id);
        case 'location':
          return deleteLocation.mutateAsync(operation.item.id);
      }
    },
    [
      deleteCategories,
      deleteCategory,
      deleteLocations,
      deleteLocation,
      deletePeople,
      deletePerson,
      deleteTags,
      deleteTag,
    ]
  );

  const finalizePending = useCallback(() => {
    if (finalizingRef.current) return finalizingRef.current;

    const operation = pendingRef.current;
    if (!operation) return Promise.resolve(true);

    if (toastIdRef.current !== null) {
      dismissToast(toastIdRef.current);
      toastIdRef.current = null;
    }

    const deletion = deleteOperation(operation)
      .then(() => {
        if (pendingRef.current === operation) updatePending(null);
        return true;
      })
      .catch(() => {
        if (pendingRef.current === operation) updatePending(null);
        showToast({
          message: deletionFailureMessage(operation),
          kind: 'error',
        });
        return false;
      })
      .finally(() => {
        finalizingRef.current = null;
      });

    finalizingRef.current = deletion;
    return deletion;
  }, [deleteOperation, dismissToast, showToast, updatePending]);

  const startDelay = useCallback(
    (operation: PendingMetadataOperation) => {
      updatePending(operation);
      toastIdRef.current = showToast({
        message: deletionPrompt(operation),
        duration: DELETE_DELAY_MS,
        showProgress: true,
        actions: [
          {
            label: 'Undo',
            onPress: () => updatePending(null),
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
    [finalizePending, showToast, updatePending]
  );

  const queueOperation = useCallback(
    (operation: PendingMetadataOperation, onConfirmed?: () => void) => {
      onConfirmed?.();
      void (async () => {
        if (pendingRef.current) {
          const finalized = await finalizePending();
          if (!finalized) return;
        }
        startDelay(operation);
      })();
    },
    [finalizePending, startDelay]
  );

  const requestDeletion = useCallback(
    (metadata: PendingMetadataDeletion, onConfirmed?: () => void) => {
      confirmMetadataDeletion(metadata, () => {
        queueOperation({ type: 'single', item: metadata }, onConfirmed);
      });
    },
    [queueOperation]
  );

  const requestManyDeletions = useCallback(
    (
      metadata: readonly PendingMetadataDeletion[],
      label: string,
      onConfirmed?: () => void
    ) => {
      if (metadata.length === 0) return;
      const eventCount = metadata.reduce(
        (total, item) => total + item.eventCount,
        0
      );
      confirmManyMetadataDeletion(metadata.length, label, eventCount, () => {
        queueOperation(
          {
            type: 'many',
            kind: metadata[0]!.kind,
            ids: metadata.map((item) => item.id),
            label,
          },
          onConfirmed
        );
      });
    },
    [queueOperation]
  );

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!pendingRef.current || allowNavigationRef.current) return;

        event.preventDefault();
        void finalizePending().then((deleted) => {
          if (!deleted) return;
          allowNavigationRef.current = true;
          navigation.dispatch(event.data.action);
        });
      }),
    [finalizePending, navigation]
  );

  const pendingIds = new Set(
    pending ? (pending.type === 'single' ? [pending.item.id] : pending.ids) : []
  );
  const pendingKind = pending
    ? pending.type === 'single'
      ? pending.item.kind
      : pending.kind
    : null;

  return (
    <MetadataDeletionContext.Provider
      value={{
        pendingKind,
        pendingIds,
        requestDeletion,
        requestManyDeletions,
        finalizePending,
      }}
    >
      {children}
    </MetadataDeletionContext.Provider>
  );
}

export function useMetadataDeletion() {
  const context = useContext(MetadataDeletionContext);

  if (!context) {
    throw new Error(
      'useMetadataDeletion must be used inside MetadataDeletionProvider'
    );
  }

  return context;
}

function deletionPrompt(operation: PendingMetadataOperation) {
  return operation.type === 'single'
    ? `Delete “${operation.item.name}”?`
    : `Delete ${operation.ids.length} ${operation.label.toLowerCase()}?`;
}

function deletionFailureMessage(operation: PendingMetadataOperation) {
  return operation.type === 'single'
    ? `“${operation.item.name}” was not deleted. Please try again.`
    : `The selected ${operation.label.toLowerCase()} were not deleted. Please try again.`;
}
