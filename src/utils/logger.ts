export function reportFailed(name: string, reason?: any) {
  console.log("Import failed", name, reason);
}

export function reportAttachmentSuccess(name: string) {
  console.log("Attachment imported:", name);
}

export function reportSkipped(name: string, reason?: any) {
  console.log("Import skipped", name, reason);
}

export function reportProgress(current: number, total: number) {
  if (total <= 0) return;
  console.log("Current progress:", ((100 * current) / total).toFixed(1) + "%");
}
