import { createContext, useContext, type ReactNode } from 'react';
import type { AttachmentStorageAccess } from './storageAccess';

const Context = createContext<AttachmentStorageAccess | null>(null);

export function AttachmentStorageAccessProvider({
  access,
  children,
}: {
  access: AttachmentStorageAccess;
  children: ReactNode;
}) {
  return <Context.Provider value={access}>{children}</Context.Provider>;
}

export function useAttachmentStorageAccess(): AttachmentStorageAccess {
  const access = useContext(Context);
  if (!access)
    throw new Error('Attachment storage access requires its provider.');
  return access;
}
