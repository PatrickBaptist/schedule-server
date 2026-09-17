const GOOGLE_USER_CONTENT_HOST = "googleusercontent.com";

export function resizeGooglePhotoURL(photoURL: string | null, size = 512): string | null {
    if (!photoURL) {
        return null;
    }

    try {
        const url = new URL(photoURL);
        const isGoogleUserContent = url.hostname === GOOGLE_USER_CONTENT_HOST
            || url.hostname.endsWith(`.${GOOGLE_USER_CONTENT_HOST}`);

        if (!isGoogleUserContent) {
            return photoURL;
        }

        url.pathname = url.pathname.replace(/=s\d+(?:-[a-z0-9]+)*$/i, `=s${size}-c`);
        return url.toString();
    } catch {
        return photoURL;
    }
}
