import React from 'react';
import { RoutePlanResult } from '../../types/bunbetsu';
import { PedestrianRoutesCard } from '../Step3Plan/PedestrianRoutesCard';

interface RouteLegendProps {
  routeResult: RoutePlanResult;
  isStale?: boolean;
}

export const RouteLegend: React.FC<RouteLegendProps> = ({
  routeResult,
  isStale = false,
}) => {
  return (
    <PedestrianRoutesCard
      routeResult={routeResult}
      isStale={isStale}
    />
  );
};


