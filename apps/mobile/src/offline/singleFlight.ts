export function createSingleFlight<T>() {
  let active: Promise<T> | null = null;

  return (operation: () => Promise<T>): Promise<T> => {
    if (active) return active;
    const running = Promise.resolve().then(operation);
    active = running;
    const clear = () => {
      if (active === running) active = null;
    };
    void running.then(clear, clear);
    return running;
  };
}
