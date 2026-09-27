// Container extensions accepted by both the native picker and drag-and-drop.
// FFprobe still checks that the selected file contains video and audio.
export const VIDEO_EXTENSIONS=['mp4','mkv','mov','avi','webm','m4v','wmv','asf','mpg','mpeg','ts','mts','m2ts','flv','ogv','3gp','3g2','vob'];
export const VIDEO_FORMATS_LABEL=VIDEO_EXTENSIONS.map(extension=>extension==='webm'?'WebM':extension.toUpperCase()).join(', ');
export const VIDEO_FILE_ERROR='Choose one supported video file, such as MP4, MKV, MOV, AVI, or WebM.';
export function isVideoFile(file){const extension=typeof file==='string'&&/\.([^.\\/]+)$/.exec(file);return !!extension&&VIDEO_EXTENSIONS.includes(extension[1].toLowerCase());}
