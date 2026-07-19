import {useEffect, useRef, useState} from "react";

interface ContainerSize {
  width: number;
  height: number;
}

export function useContainerSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ContainerSize>({width: 0, height: 0});

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = (width: number, height: number) => {
      setSize({width: Math.max(0, Math.floor(width)), height: Math.max(0, Math.floor(height))});
    };
    const bounds = element.getBoundingClientRect();
    update(bounds.width, bounds.height);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return {ref, ...size};
}
