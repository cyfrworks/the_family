import { useWindowDimensions } from 'react-native';

const BREAKPOINT_MD = 768;
const BREAKPOINT_LG = 1024;

export function useResponsive() {
  const { width } = useWindowDimensions();
  return {
    isPhone: width < BREAKPOINT_MD,
    isTablet: width >= BREAKPOINT_MD && width < BREAKPOINT_LG,
    isDesktop: width >= BREAKPOINT_LG,
    width,
  };
}
