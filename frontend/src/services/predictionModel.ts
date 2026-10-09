/**
 * @deprecated
 * The local TypeScript prediction simulation has been superseded by the dedicated
 * FastAPI prediction client in `predictionApi.ts`.
 * Predictions are now executed exclusively by the frozen Python mathematical model
 * via POST /api/prediction/waste.
 */

export { requestWastePrediction } from './predictionApi';
