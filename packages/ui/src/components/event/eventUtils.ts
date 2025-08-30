// Shared utility functions for event components

export interface Pet {
  id: number;
  name: string;
  breed: string;
  birth_date: string;
}

export interface ContextData {
  wasteWeight: number | null;
  litterRemaining: number | null;
  deepCleanTimer: number | null;
  totalVisits: number | null;
  daysSinceLitterReplaced: number | null;
  hoursSinceLastScoop: number | null;
}

export interface ChartData {
  timestamps: number[];
  weights: number[];
  context: ContextData;
}

export function parseRawBuffer(bufferData: number[] | null): ChartData {
  if (!bufferData || bufferData.length < 23) {
    return { 
      timestamps: [], 
      weights: [], 
      context: {} as ContextData 
    };
  }
  
  try {
    const uint8Array = new Uint8Array(bufferData);
    const dataView = new DataView(uint8Array.buffer);
    
    let offset = 0;
    
    // Skip version (1 byte)
    offset += 1;
    
    // Skip startTimestamp (8 bytes)
    offset += 8;
    
    // Read context data (10 bytes)
    const context: ContextData = {
      wasteWeight: null,
      litterRemaining: null,
      deepCleanTimer: null,
      totalVisits: null,
      daysSinceLitterReplaced: null,
      hoursSinceLastScoop: null,
    };
    
    const wasteWeight = dataView.getUint16(offset, false);
    context.wasteWeight = wasteWeight === 65535 ? null : wasteWeight;
    offset += 2;
    
    const litterRemaining = dataView.getUint16(offset, false);
    context.litterRemaining = litterRemaining === 65535 ? null : litterRemaining;
    offset += 2;
    
    const deepCleanTimer = dataView.getUint8(offset);
    context.deepCleanTimer = deepCleanTimer === 255 ? null : deepCleanTimer;
    offset += 1;
    
    const totalVisits = dataView.getUint8(offset);
    context.totalVisits = totalVisits === 255 ? null : totalVisits;
    offset += 1;
    
    const daysSinceLitterReplaced = dataView.getUint8(offset);
    context.daysSinceLitterReplaced = daysSinceLitterReplaced === 255 ? null : daysSinceLitterReplaced;
    offset += 1;
    
    const hoursSinceLastScoop = dataView.getUint8(offset);
    context.hoursSinceLastScoop = hoursSinceLastScoop === 255 ? null : hoursSinceLastScoop;
    offset += 1;
    
    // Skip reserved bytes (2 bytes)
    offset += 2;
    
    // Read weight count
    const count = dataView.getUint32(offset, false);
    offset += 4;
    
    const timestamps: number[] = [];
    const weights: number[] = [];
    
    // Read our calculated tared weights
    for (let i = 0; i < count && (offset + i * 2) < uint8Array.length; i++) {
      const weight = dataView.getInt16(offset + i * 2, false);
      
      timestamps.push(i * 100); // 100ms intervals (10Hz)
      weights.push(weight);
    }
    
    return { timestamps, weights, context };
  } catch (error) {
    console.error('Failed to parse buffer data:', error);
    return { 
      timestamps: [], 
      weights: [], 
      context: {} as ContextData 
    };
  }
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatWeight(weightInGrams: number, unit: 'g' | 'kg' = 'g'): string {
  if (unit === 'kg') {
    const kg = weightInGrams / 1000;
    return `${kg.toFixed(2)} kg`;
  }
  return `${weightInGrams.toFixed(0)}g`;
}
