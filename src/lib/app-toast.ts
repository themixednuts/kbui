import { toast } from "svelte-sonner";

export type AppNoticeTone = "info" | "success" | "error";

const NOTICE_DURATION_MS = 7000;

const toastOptions = {
  duration: NOTICE_DURATION_MS,
  dismissible: true,
  closeButton: true,
  classes: {
    toast: "app-toast",
    title: "app-toast-title",
    closeButton: "app-toast-close",
  },
} as const;

export function showAppToast(message: string, tone: AppNoticeTone = "info") {
  switch (tone) {
    case "success":
      return toast.success(message, toastOptions);
    case "error":
      return toast.error(message, toastOptions);
    default:
      return toast.info(message, toastOptions);
  }
}
