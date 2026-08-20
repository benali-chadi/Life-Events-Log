export type AttachmentPreview = {
  id: string;
  uri: string;
  isAvailable: boolean;
  filename: string;
  mimeType: string | null;
};

export type AttachmentDraft = {
  uri: string;
  filename: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
};
