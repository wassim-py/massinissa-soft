"use client";

import { useState, useEffect, useCallback } from "react";
import { executeWithRetry } from "./retryUtils";

export interface ReferenceData {
  branches: Array<{ id: number; name: string }>;
  levels: Array<{ id: number; name: string }>;
  languages: Array<{ id: number; name: string }>;
  formationLevels: Array<{ id: number; name: string }>;
  timestamp?: number;
}

const CACHE_KEY = "mss_reference_data_v1";
const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory module cache for instant synchronous access during session
let inMemoryCache: ReferenceData | null = null;
let inMemoryTimestamp = 0;
let isFetching = false;

function loadFromStorage(): ReferenceData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReferenceData;
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(data: ReferenceData): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Fetch reference data over network with retry.
 */
async function fetchReferenceData(): Promise<ReferenceData> {
  return executeWithRetry(async () => {
    const res = await fetch("/api/reference-data");
    if (!res.ok) {
      throw new Error(`Failed to fetch reference data: HTTP ${res.status}`);
    }
    return res.json();
  });
}

/**
 * Client hook providing Stale-While-Revalidate caching for rarely changing reference data:
 * branches, levels, subjects, and formation languages (§7.21).
 */
export function useReferenceData() {
  const [data, setData] = useState<ReferenceData>(() => {
    if (inMemoryCache) return inMemoryCache;
    const fromStorage = loadFromStorage();
    if (fromStorage) {
      inMemoryCache = fromStorage;
      inMemoryTimestamp = fromStorage.timestamp || Date.now();
      return fromStorage;
    }
    return {
      branches: [],
      levels: [],
      languages: [],
      formationLevels: [],
    };
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return !inMemoryCache && !loadFromStorage();
  });

  const revalidate = useCallback(async () => {
    if (isFetching) return;
    isFetching = true;

    try {
      const fresh = await fetchReferenceData();
      inMemoryCache = fresh;
      inMemoryTimestamp = Date.now();
      saveToStorage(fresh);
      setData(fresh);
    } catch (err) {
      // SWR philosophy: if background revalidation fails, keep serving stale data
      console.warn("SWR background revalidation failed, serving stale cache:", err);
    } finally {
      isFetching = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const now = Date.now();
    const isStale = !inMemoryCache || now - inMemoryTimestamp > REVALIDATE_INTERVAL_MS;

    if (isStale) {
      revalidate();
    }
  }, [revalidate]);

  return {
    ...data,
    isLoading,
    revalidate,
  };
}
