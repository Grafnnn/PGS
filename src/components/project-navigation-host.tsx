"use client";

import { createContext } from "react";

// undefined keeps standalone renderers usable; null waits for the shared header.
export const ProjectNavigationHostContext = createContext<HTMLElement | null | undefined>(undefined);
