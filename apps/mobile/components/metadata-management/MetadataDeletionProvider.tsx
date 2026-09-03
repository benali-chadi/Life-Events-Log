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
  useDeletePersonMutation,
  useDeleteTagMutation,
} from '@/data/query';
import type { UUID } from '@/models';
import { confirmMetadataDeletion } from './confirmMetadataDeletion';

export type MetadataDeletionKind = 'category' | 'tag' | 'person' | 'location';

export type PendingMetadataDeletion = {
  kind: MetadataDeletionKind;
  id: UUID;
  name: string;
  eventCount: number;
};

type MetadataDeletionContextValue = {
  pending: PendingMetadataDeletion | null;
  requestDeletion: (
    metadata: PendingMetadataDeletion,
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
  const [pending, setPending] = useState<PendingMetadataDeletion | null>(null);
  const pendingRef = useRef<PendingMetadataDeletion | null>(null);
  const finalizingRef = useRef<Promise<boolean> | null>(null);
  const toastIdRef = useRef<number | null>(null);
  const allowNavigationRef = useRef(false);

  const setPendingMetadata = useCallback(
    (metadata: PendingMetadataDeletion | null) => {
      pendingRef.current = metadata;
      setPending(metadata);
    },
    []
  );

  const deleteMetadata = useCallback(
    (metadata: PendingMetadataDeletion) => {
      switch (metadata.kind) {
        case 'category':
          return deleteCategory.mutateAsync(metadata.id);
        case 'tag':
          return deleteTag.mutateAsync(metadata.id);
        case 'person':
          return deletePerson.mutateAsync(metadata.id);
        case 'location':
          return deleteLocation.mutateAsync(metadata.id);
      }
    },
    [deleteCategory, deleteLocation, deletePerson, deleteTag]
  );

  const finalizePending = useCallback(() => {
    if (finalizingRef.current) return finalizingRef.current;

    const metadata = pendingRef.current;
    if (!metadata) return Promise.resolve(true);

    if (toastIdRef.current !== null) {
      dismissToast(toastIdRef.current);
      toastIdRef.current = null;
    }

    const operation = deleteMetadata(metadata)
      .then(() => {
        if (
          pendingRef.current?.kind === metadata.kind &&
          pendingRef.current.id === metadata.id
        ) {
          setPendingMetadata(null);
        }
        return true;
      })
      .catch(() => {
        setPendingMetadata(null);
        showToast({
          message: `“${metadata.name}” was not deleted. Please try again.`,
          kind: 'error',
        });
        return false;
      })
      .finally(() => {
        finalizingRef.current = null;
      });

    finalizingRef.current = operation;
    return operation;
  }, [deleteMetadata, dismissToast, setPendingMetadata, showToast]);

  const startDelay = useCallback(
    (metadata: PendingMetadataDeletion) => {
      setPendingMetadata(metadata);
      toastIdRef.current = showToast({
        message: `Delete “${metadata.name}”?`,
        duration: DELETE_DELAY_MS,
        showProgress: true,
        actions: [
          {
            label: 'Undo',
            onPress: () => setPendingMetadata(null),
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
    [finalizePending, setPendingMetadata, showToast]
  );

  const requestDeletion = useCallback(
    (metadata: PendingMetadataDeletion, onConfirmed?: () => void) => {
      confirmMetadataDeletion(metadata, () => {
        onConfirmed?.();
        void (async () => {
          if (pendingRef.current) await finalizePending();
          startDelay(metadata);
        })();
      });
    },
    [finalizePending, startDelay]
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

  return (
    <MetadataDeletionContext.Provider
      value={{ pending, requestDeletion, finalizePending }}
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
