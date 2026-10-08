import { useState, useCallback, useEffect } from 'react';
import { CampusMap } from './components/Map/CampusMap';
import { CollegeSearch } from './components/CollegeSearch/CollegeSearch';
import { fetchCampus } from './services/api';
import type { CampusData } from './types/map';
import './App.css';

export function App() {
  const [campus, setCampus] = useState<CampusData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async (collegeName: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchCampus(collegeName);
      setCampus(data);
    } catch (err) {
      setCampus(null);
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleClearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-load default test campus (MNNIT Allahabad) on initial launch
  useEffect(() => {
    handleSearch('MNNIT Allahabad');
  }, [handleSearch]);

  return (
    <main className="bunbetsu-app">
      <CampusMap campus={campus} />
      <CollegeSearch
        onSearch={handleSearch}
        isLoading={isLoading}
        error={error}
        currentCampus={campus}
        onClearError={handleClearError}
      />
    </main>
  );
}

export default App;
