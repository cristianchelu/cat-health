import * as React from "react";
import { FaTint, FaPoop, FaQuestion, FaGift } from 'react-icons/fa';
import type { EventData } from '../types';

// Helper to get elimination type icon
export const getEliminationIcon = (eliminationType: string): React.ReactElement => {
  switch (eliminationType) {
    case 'urination':
      return React.createElement(FaTint, { className: "elimination-icon urination" });
    case 'defecation':
      return React.createElement(FaPoop, { className: "elimination-icon defecation" });
    case 'both':
      return React.createElement(FaGift, { className: "elimination-icon both" });
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
    case 'both':
      return { bg: 'rgba(76, 175, 80, 0.7)', border: 'rgb(76, 175, 80)' }; // Green
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

const defaultCats = [6600, 4700];
export const getLatestCatWeights = (events: EventData[], cutoff?: string) => {
  const weightEventsByPet = events
    .filter((e) => e.data.type === "weight_measurement")
    .filter((e) => !cutoff || new Date(e.timestamp) <= new Date(cutoff))
    .reduce((acc, event) => {
      const petId = event.data.pet_id as number;
      if (!acc[petId]) {
        acc[petId] = [];
      }
      acc[petId].push(event);
      return acc;
    }, {} as Record<number, typeof events>);
    return [
    weightEventsByPet[0]?.[0]?.data.weight as number || defaultCats[0],
    weightEventsByPet[1]?.[0]?.data.weight as number || defaultCats[1],
  ];
}