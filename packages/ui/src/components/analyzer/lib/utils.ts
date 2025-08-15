import * as React from "react";
import { FaTint, FaPoop, FaQuestion } from 'react-icons/fa';
import type { EventData } from '../types';

// Helper to safely get event data properties
export const getEventDataProp = (data: Record<string, unknown>, key: string): unknown => {
  return data[key];
};

// Helper to get elimination type icon
export const getEliminationIcon = (eliminationType: string): React.ReactElement => {
  switch (eliminationType) {
    case 'urination':
      return React.createElement(FaTint, { className: "elimination-icon urination" });
    case 'defecation':
      return React.createElement(FaPoop, { className: "elimination-icon defecation" });
    default:
      return React.createElement(FaQuestion, { className: "elimination-icon unknown" });
  }
};

// Get color for elimination type
export const getEliminationColor = (eliminationType: string) => {
  switch (eliminationType) {
    case 'urination':
      return { bg: 'rgba(255, 193, 7, 0.7)', border: 'rgb(255, 193, 7)' }; // Yellow
    case 'defecation':
      return { bg: 'rgba(121, 85, 72, 0.7)', border: 'rgb(121, 85, 72)' }; // Brown
    case 'unknown':
    default:
      return { bg: 'rgba(158, 158, 158, 0.7)', border: 'rgb(158, 158, 158)' }; // Gray
  }
};

// Filter events with raw data
export const filterLitterboxEvents = (events: EventData[]): EventData[] => {
  return events.filter(event => 
    event.data && 
    typeof event.data === 'object' &&
    'type' in event.data &&
    event.data.type === 'litterbox_use' && 
    event.raw_data && 
    event.raw_data.length > 0
  );
};
