import type { DecodedData } from '../types';

export const decodeRawData = (rawDataArray: number[]): DecodedData => {
  if (!rawDataArray || rawDataArray.length === 0) {
    throw new Error('No raw data available');
  }
  
  const uint8Array = new Uint8Array(rawDataArray);
  const buffer = uint8Array.buffer;
  const dataView = new DataView(buffer);
  let offset = 0;
  
  const version = dataView.getUint8(offset);
  offset += 1;
  
  if (version !== 1) {
    throw new Error(`Unsupported version: ${version}`);
  }
  
  const startTimestamp = Number(dataView.getBigUint64(offset, false));
  offset += 8;
  
  const context: DecodedData['context'] = {};
  const wasteWeight = dataView.getUint16(offset, false);
  context.wasteWeight = wasteWeight === 65535 ? undefined : wasteWeight;
  offset += 2;
  
  const litterRemaining = dataView.getUint16(offset, false);
  context.litterRemaining = litterRemaining === 65535 ? undefined : litterRemaining;
  offset += 2;
  
  const deepCleanTimer = dataView.getUint8(offset);
  context.deepCleanTimer = deepCleanTimer === 255 ? undefined : deepCleanTimer;
  offset += 1;
  
  const totalVisits = dataView.getUint8(offset);
  context.totalVisits = totalVisits === 255 ? undefined : totalVisits;
  offset += 1;
  
  const daysSinceLitterReplaced = dataView.getUint8(offset);
  context.daysSinceLitterReplaced = daysSinceLitterReplaced === 255 ? undefined : daysSinceLitterReplaced;
  offset += 1;
  
  const hoursSinceLastScoop = dataView.getUint8(offset);
  context.hoursSinceLastScoop = hoursSinceLastScoop === 255 ? undefined : hoursSinceLastScoop;
  offset += 1;
  
  offset += 2; // Skip reserved
  
  const count = dataView.getUint32(offset, false);
  offset += 4;
  
  const measurements = [];
  for (let i = 0; i < count; i++) {
    const weight = dataView.getInt16(offset, false);
    measurements.push({ weight });
    offset += 2;
  }
  
  return {
    startTime: new Date(startTimestamp),
    measurements,
    context
  };
};
