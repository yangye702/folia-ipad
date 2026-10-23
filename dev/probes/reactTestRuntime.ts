import React from 'react';
import { createRoot } from 'react-dom/client';

// Browser tests share the app's Vite-resolved React, including isolated optimizer caches.
export { React as default, createRoot };
