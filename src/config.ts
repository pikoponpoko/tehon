// Dropbox App key (public; PKCE needs no secret). Set VITE_DROPBOX_APP_KEY at build time.
export const DROPBOX_APP_KEY: string = import.meta.env.VITE_DROPBOX_APP_KEY ?? "";

// Eagle library import is a test-only feature: on in dev, off in builds unless VITE_EAGLE_IMPORT=1.
export const EAGLE_IMPORT: boolean = import.meta.env.DEV || import.meta.env.VITE_EAGLE_IMPORT === "1";

export const DROPBOX_SCOPES = ["files.metadata.read", "files.content.read", "files.content.write"];

// Must match a Redirect URI registered in the Dropbox App Console exactly.
export const redirectUri = (): string => location.origin + "/";
