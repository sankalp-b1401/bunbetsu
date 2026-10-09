import React from 'react';
import {
  UtensilsCrossed,
  Music,
  Drama,
  Palette,
  Trophy,
  Laptop,
} from 'lucide-react';
import { ActivityType, Campus } from '../types/bunbetsu';

export interface ActivityMeta {
  type: ActivityType;
  color: string;
  bgColor: string;
  borderColor: string;
  fillColor: string;
  badgeBg: string;
  badgeText: string;
  iconName: string;
  weight: number;
  intensityBands: [number, number, number]; // [Low, Medium, High] frozen internal multipliers
  description: string;
}

export const ACTIVITY_ICONS: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  'Food Stalls': UtensilsCrossed,
  'Music Concert': Music,
  'Performing Arts': Drama,
  'Literary & Fine Arts': Palette,
  'Sports': Trophy,
  'Hackathon': Laptop,
};

export const ActivityIcon: React.FC<{ type: ActivityType; className?: string }> = ({
  type,
  className = 'w-3.5 h-3.5',
}) => {
  const IconComponent = ACTIVITY_ICONS[type] || Palette;
  return React.createElement(IconComponent, { className });
};

export const ACTIVITIES: Record<ActivityType, ActivityMeta> = {
  'Food Stalls': {
    type: 'Food Stalls',
    color: '#EA580C', // orange-600
    bgColor: '#FFF7ED',
    borderColor: '#EA580C',
    fillColor: 'rgba(234, 88, 12, 0.28)',
    badgeBg: '#FFEDD5',
    badgeText: '#9A3412',
    iconName: 'Utensils',
    weight: 5,
    intensityBands: [1.5, 1.7, 1.9],
    description: 'High organic waste, compostable cutlery, single-use food packaging',
  },
  'Music Concert': {
    type: 'Music Concert',
    color: '#8B5CF6', // purple-500
    bgColor: '#F5F3FF',
    borderColor: '#7C3AED',
    fillColor: 'rgba(139, 92, 246, 0.28)',
    badgeBg: '#EDE9FE',
    badgeText: '#5B21B6',
    iconName: 'Music',
    weight: 4,
    intensityBands: [1.2, 1.35, 1.5],
    description: 'High beverage cups, PET bottles, glowsticks, wristbands',
  },
  'Performing Arts': {
    type: 'Performing Arts',
    color: '#C026D3', // fuchsia-600
    bgColor: '#FDF4FF',
    borderColor: '#C026D3',
    fillColor: 'rgba(192, 38, 211, 0.28)',
    badgeBg: '#FAE8FF',
    badgeText: '#86198F',
    iconName: 'Theater',
    weight: 3,
    intensityBands: [1.0, 1.15, 1.3],
    description: 'Stage props, flyers, decorative cardboard, packaging',
  },
  'Literary & Fine Arts': {
    type: 'Literary & Fine Arts',
    color: '#0D9488', // teal-600
    bgColor: '#F0FDFA',
    borderColor: '#0D9488',
    fillColor: 'rgba(13, 148, 136, 0.28)',
    badgeBg: '#CCFBF1',
    badgeText: '#115E59',
    iconName: 'Palette',
    weight: 2,
    intensityBands: [0.8, 0.9, 1.0],
    description: 'Paper waste, canvas scraps, stationery, exhibition boards',
  },
  'Sports': {
    type: 'Sports',
    color: '#2563EB', // blue-600
    bgColor: '#EFF6FF',
    borderColor: '#2563EB',
    fillColor: 'rgba(37, 99, 235, 0.28)',
    badgeBg: '#DBEAFE',
    badgeText: '#1E40AF',
    iconName: 'Activity',
    weight: 1,
    intensityBands: [1.1, 1.3, 1.5],
    description: 'Electrolyte bottles, packaging, athletic tapes, snack wrappers',
  },
  'Hackathon': {
    type: 'Hackathon',
    color: '#4F46E5', // indigo-600
    bgColor: '#EEF2FF',
    borderColor: '#4F46E5',
    fillColor: 'rgba(79, 70, 229, 0.28)',
    badgeBg: '#E0E7FF',
    badgeText: '#3730A3',
    iconName: 'Code',
    weight: 1,
    intensityBands: [0.9, 1.05, 1.2],
    description: 'Coffee cups, late-night snack containers, electronic scrap, cardboard',
  },
};

export const DEFAULT_TAGS = [
  'Food Service',
  'High Footfall',
  'Main Area',
  'Performance',
  'Registration',
  'VIP Enclosure',
  'Recycling Hub',
  'Restricted Access',
];

/**
 * High-accuracy campus coordinates & realistic boundary polygons
 * (Normalized GeoJSON ready for MapLibre sources)
 */
export const SAMPLE_CAMPUSES: Campus[] = [
  {
    id: 'mnnit-allahabad',
    name: 'MNNIT Allahabad',
    fullName: 'Motilal Nehru National Institute of Technology',
    address: 'Barrister Mullah Colony, Teliarganj',
    city: 'Prayagraj (Allahabad)',
    state: 'Uttar Pradesh',
    country: 'India',
    approxAreaHectares: 243,
    boundarySource: 'OpenStreetMap',
    hasBoundary: true,
    center: [81.8624, 25.4925],
    defaultZoom: 15.6,
    imageUrl: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=600&q=80',
    boundaryGeometry: {
      type: 'Polygon',
      coordinates: [[
        [81.8560, 25.4960],
        [81.8635, 25.4985],
        [81.8690, 25.4950],
        [81.8705, 25.4890],
        [81.8655, 25.4865],
        [81.8580, 25.4880],
        [81.8550, 25.4920],
        [81.8560, 25.4960],
      ]],
    },
    defaultLocations: [
      {
        id: 'loc-food-court-mnnit',
        name: 'Food Court',
        activities: [],
        area: 12500,
        description: 'Main food stalls area near central lawn',
        relativeIntensity: 'Medium',
        tags: ['Food Service', 'High Footfall', 'Main Area'],
        center: [81.8615, 25.4935],
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [81.8598, 25.4948],
            [81.8632, 25.4952],
            [81.8638, 25.4926],
            [81.8604, 25.4920],
            [81.8598, 25.4948],
          ]],
        },
      },
      {
        id: 'loc-main-stage-mnnit',
        name: 'Main Stage',
        activities: [],
        area: 8400,
        description: 'Open air theatre for celebrity night & rock band competitions',
        relativeIntensity: 'High',
        tags: ['Performance', 'High Footfall'],
        center: [81.8645, 25.4915],
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [81.8635, 25.4925],
            [81.8662, 25.4927],
            [81.8665, 25.4905],
            [81.8638, 25.4903],
            [81.8635, 25.4925],
          ]],
        },
      },
      {
        id: 'loc-sports-mnnit',
        name: 'Sports Ground',
        activities: [],
        area: 16200,
        description: 'Athletics pavilion and athletic tournament zones',
        relativeIntensity: 'Low',
        tags: ['Main Area'],
        center: [81.8675, 25.4892],
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [81.8660, 25.4905],
            [81.8698, 25.4902],
            [81.8695, 25.4880],
            [81.8658, 25.4882],
            [81.8660, 25.4905],
          ]],
        },
      },
      {
        id: 'loc-gate-mnnit',
        name: 'Main Gate',
        activities: [],
        area: 3200,
        description: 'Visitor welcome registration & display stalls',
        relativeIntensity: 'Medium',
        tags: ['Registration'],
        center: [81.8575, 25.4900],
        geometry: {
          type: 'Point',
          coordinates: [81.8575, 25.4900],
        },
      },
    ],
  },
  {
    id: 'nit-trichy',
    name: 'NIT Trichy Campus',
    fullName: 'National Institute of Technology Tiruchirappalli',
    address: 'Tanjore Main Road, Thuvakudi',
    city: 'Tiruchirappalli',
    state: 'Tamil Nadu',
    country: 'India',
    approxAreaHectares: 320,
    boundarySource: 'OpenStreetMap',
    hasBoundary: true,
    center: [78.8145, 10.7610],
    defaultZoom: 15.5,
    imageUrl: 'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=600&q=80',
    boundaryGeometry: {
      type: 'Polygon',
      coordinates: [[
        [78.8080, 10.7670],
        [78.8185, 10.7695],
        [78.8230, 10.7620],
        [78.8210, 10.7550],
        [78.8115, 10.7535],
        [78.8070, 10.7595],
        [78.8080, 10.7670],
      ]],
    },
    defaultLocations: [
      {
        id: 'loc-food-nitt',
        name: 'Food Court',
        activities: [],
        area: 12500,
        description: 'Central cafeteria quad and outdoor food kiosks',
        relativeIntensity: 'Medium',
        tags: ['Food Service', 'High Footfall', 'Main Area'],
        center: [78.8130, 10.7635],
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [78.8110, 10.7650],
            [78.8152, 10.7655],
            [78.8158, 10.7622],
            [78.8116, 10.7618],
            [78.8110, 10.7650],
          ]],
        },
      },
      {
        id: 'loc-stage-nitt',
        name: 'Main Stage',
        activities: [],
        area: 9100,
        description: 'Open Air Theatre (OAT) for Festember concerts',
        relativeIntensity: 'High',
        tags: ['Performance', 'High Footfall'],
        center: [78.8165, 10.7605],
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [78.8150, 10.7618],
            [78.8182, 10.7620],
            [78.8185, 10.7595],
            [78.8152, 10.7592],
            [78.8150, 10.7618],
          ]],
        },
      },
      {
        id: 'loc-sports-nitt',
        name: 'Sports Ground',
        activities: [],
        area: 18500,
        description: 'Golden Jubilee stadium complex and fields',
        relativeIntensity: 'Low',
        tags: ['Main Area'],
        center: [78.8190, 10.7580],
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [78.8175, 10.7595],
            [78.8212, 10.7592],
            [78.8210, 10.7565],
            [78.8172, 10.7568],
            [78.8175, 10.7595],
          ]],
        },
      },
      {
        id: 'loc-gate-nitt',
        name: 'Main Gate',
        activities: [],
        area: 2800,
        description: 'Main highway entry & security reception',
        relativeIntensity: 'Medium',
        tags: ['Registration'],
        center: [78.8095, 10.7588],
        geometry: {
          type: 'Point',
          coordinates: [78.8095, 10.7588],
        },
      },
    ],
  },
  {
    id: 'iit-delhi',
    name: 'IIT Delhi',
    fullName: 'Indian Institute of Technology Delhi',
    address: 'Hauz Khas',
    city: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    approxAreaHectares: 130,
    boundarySource: 'OpenStreetMap',
    hasBoundary: true,
    center: [77.1928, 28.5450],
    defaultZoom: 15.6,
    imageUrl: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=600&q=80',
    boundaryGeometry: {
      type: 'Polygon',
      coordinates: [[
        [77.1865, 28.5490],
        [77.1970, 28.5505],
        [77.2005, 28.5440],
        [77.1965, 28.5395],
        [77.1880, 28.5400],
        [77.1855, 28.5450],
        [77.1865, 28.5490],
      ]],
    },
    defaultLocations: [
      {
        id: 'loc-food-iitd',
        name: 'SAC Food Quad',
        activities: [],
        area: 9800,
        description: 'Student Activity Center lawns and night mess courtyard',
        relativeIntensity: 'Medium',
        tags: ['Food Service', 'High Footfall'],
        center: [77.1925, 28.5460],
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [77.1910, 28.5472],
            [77.1942, 28.5475],
            [77.1945, 28.5452],
            [77.1912, 28.5448],
            [77.1910, 28.5472],
          ]],
        },
      },
      {
        id: 'loc-stage-iitd',
        name: 'OAT Amphitheatre',
        activities: [],
        area: 7200,
        description: 'Open air theatre for Rendezvous star nights',
        relativeIntensity: 'High',
        tags: ['Performance', 'Main Area'],
        center: [77.1950, 28.5440],
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [77.1938, 28.5450],
            [77.1965, 28.5452],
            [77.1968, 28.5430],
            [77.1940, 28.5428],
            [77.1938, 28.5450],
          ]],
        },
      },
      {
        id: 'loc-hack-iitd',
        name: 'Bharti School Arena',
        activities: [],
        area: 5500,
        description: '24-hour hackathon floor and developer workstations',
        relativeIntensity: 'High',
        tags: ['High Footfall'],
        center: [77.1905, 28.5435],
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [77.1895, 28.5445],
            [77.1920, 28.5447],
            [77.1922, 28.5425],
            [77.1897, 28.5422],
            [77.1895, 28.5445],
          ]],
        },
      },
    ],
  },
  {
    id: 'iit-bombay',
    name: 'IIT Bombay',
    fullName: 'Indian Institute of Technology Bombay',
    address: 'Powai',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    approxAreaHectares: 220,
    boundarySource: 'OpenStreetMap',
    hasBoundary: true,
    center: [72.9144, 19.1334],
    defaultZoom: 15.5,
    imageUrl: 'https://images.unsplash.com/photo-1519452635265-7b1fbfd1e4e0?auto=format&fit=crop&w=600&q=80',
    boundaryGeometry: {
      type: 'Polygon',
      coordinates: [[
        [72.9060, 19.1380],
        [72.9220, 19.1395],
        [72.9245, 19.1310],
        [72.9190, 19.1260],
        [72.9080, 19.1275],
        [72.9060, 19.1380],
      ]],
    },
    defaultLocations: [
      {
        id: 'loc-food-iitb',
        name: 'Gymkhana Grounds',
        activities: [],
        area: 14200,
        description: 'Mood Indigo festival central arena and international food lane',
        relativeIntensity: 'High',
        tags: ['Food Service', 'High Footfall', 'Performance'],
        center: [72.9140, 19.1330],
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [72.9118, 19.1345],
            [72.9162, 19.1348],
            [72.9165, 19.1315],
            [72.9122, 19.1312],
            [72.9118, 19.1345],
          ]],
        },
      },
    ],
  },
  {
    id: 'bits-pilani',
    name: 'BITS Pilani',
    fullName: 'Birla Institute of Technology and Science, Pilani',
    address: 'Vidya Vihar',
    city: 'Pilani',
    state: 'Rajasthan',
    country: 'India',
    approxAreaHectares: 133,
    boundarySource: 'OpenStreetMap',
    hasBoundary: true,
    center: [75.5873, 28.3639],
    defaultZoom: 15.6,
    imageUrl: 'https://images.unsplash.com/photo-1592280771190-3e2e4d571952?auto=format&fit=crop&w=600&q=80',
    boundaryGeometry: {
      type: 'Polygon',
      coordinates: [[
        [75.5810, 28.3680],
        [75.5925, 28.3695],
        [75.5945, 28.3610],
        [75.5890, 28.3585],
        [75.5820, 28.3605],
        [75.5810, 28.3680],
      ]],
    },
    defaultLocations: [
      {
        id: 'loc-food-bits',
        name: 'Rotunda & M-Lawns',
        activities: [],
        area: 11000,
        description: 'Iconic Rotunda circle and surrounding festive food stalls',
        relativeIntensity: 'Medium',
        tags: ['Food Service', 'Main Area'],
        center: [75.5875, 28.3645],
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [75.5855, 28.3658],
            [75.5895, 28.3660],
            [75.5898, 28.3630],
            [75.5858, 28.3628],
            [75.5855, 28.3658],
          ]],
        },
      },
    ],
  },
];
