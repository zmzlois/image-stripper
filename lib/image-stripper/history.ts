import type { HistoryEntry } from "@/lib/image-stripper/types";

function openHistoryDb() {
   return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("image-stripper", 1);

      request.onupgradeneeded = () => {
         request.result.createObjectStore("jobs", { keyPath: "id" });
      };

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
   });
}

export async function putHistory(entry: HistoryEntry) {
   const db = await openHistoryDb();

   await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("jobs", "readwrite");
      tx.objectStore("jobs").put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
   });

   db.close();
}

export async function syncHistoryToVercelBlob(entry: HistoryEntry, email: string) {
   const response = await fetch("/api/storage/vercel/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
         email,
         job: entry,
      }),
   });

   if (!response.ok) {
      throw new Error("Vercel Blob save failed.");
   }

   const payload = (await response.json().catch(() => null)) as {
      saved?: boolean;
   } | null;

   return payload?.saved === true;
}

export async function deleteHistory(id: string) {
   const db = await openHistoryDb();

   await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("jobs", "readwrite");
      tx.objectStore("jobs").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
   });

   db.close();
}

export async function getHistory(id: string) {
   const db = await openHistoryDb();
   const entry = await new Promise<HistoryEntry | undefined>(
      (resolve, reject) => {
         const request = db.transaction("jobs").objectStore("jobs").get(id);

         request.onerror = () => reject(request.error);
         request.onsuccess = () =>
            resolve(request.result as HistoryEntry | undefined);
      },
   );

   db.close();
   return entry;
}

export async function listHistory() {
   const db = await openHistoryDb();
   const entries = await new Promise<HistoryEntry[]>((resolve, reject) => {
      const request = db.transaction("jobs").objectStore("jobs").getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as HistoryEntry[]);
   });

   db.close();
   return entries.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
}
