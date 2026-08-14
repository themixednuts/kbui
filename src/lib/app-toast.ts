import { toast } from "svelte-sonner";

export type AppNoticeTone = "info" | "success" | "warning" | "error";

const NOTICE_DURATION_MS = 7000;

const toastOptions = {
  duration: NOTICE_DURATION_MS,
  dismissible: true,
  closeButton: true,
  classes: {
    toast: "app-toast",
    title: "app-toast-title",
    description: "app-toast-description",
    closeButton: "app-toast-close",
    actionButton: "app-toast-action",
  },
} as const;

export function showAppToast(message: string, tone: AppNoticeTone = "info") {
  switch (tone) {
    case "success":
      return toast.success(message, toastOptions);
    case "error":
      return toast.error(message, toastOptions);
    case "warning":
      return toast.warning(message, toastOptions);
    default:
      return toast.info(message, toastOptions);
  }
}

export function showAppUpdateToast(description: string, onReload: () => void) {
  return toast.warning("New KBUI version available", {
    ...toastOptions,
    id: "kbui-app-update",
    description,
    duration: Number.POSITIVE_INFINITY,
    dismissible: false,
    closeButton: false,
    action: {
      label: "Reload",
      onClick: onReload,
    },
  });
}
