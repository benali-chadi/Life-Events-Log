export type ColorsTheme = {
  bg: string;
  surface: string;
  surfaceElevated: string;
  shadow: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;

  interactiveMuted: string;
  interactivePressed: string;
  focus: string;

  primary: string;
  primaryPressed: string;
  onPrimary: string;

  warning: string;
  warningMuted: string;

  destructive: string;
  destructiveSurface: string;
  destructiveSurfacePressed: string;
  destructiveMuted: string;
  onDestructive: string;
};

export const lightTheme = {
  bg: '#F7F7F5',
  surface: '#FFFFFF',
  surfaceElevated: '#FCFCFB',
  shadow: '#222222',
  text: '#222222',
  textSecondary: '#616161',
  textMuted: '#8A8A8A',
  border: '#E6E5E2',
  borderStrong: '#D5D3CE',

  interactiveMuted: '#F0EFEC',
  interactivePressed: '#E9E8E4',
  focus: '#8A8A8A',

  primary: '#222222',
  primaryPressed: '#3A3A3A',
  onPrimary: '#FFFFFF',

  warning: '#9A6700',
  warningMuted: '#FFF4CC',

  destructive: '#B42318',
  destructiveSurface: '#B42318',
  destructiveSurfacePressed: '#912018',
  destructiveMuted: '#FEE4E2',
  onDestructive: '#FFFFFF',
};

export const darkTheme = {
  bg: '#171717',
  surface: '#202020',
  surfaceElevated: '#282828',
  shadow: '#080808',
  text: '#F4F4F2',
  textSecondary: '#C7C7C5',
  textMuted: '#9C9C9A',
  border: '#343434',
  borderStrong: '#4A4A4A',

  interactiveMuted: '#2D2D2D',
  interactivePressed: '#363636',
  focus: '#9C9C9A',

  primary: '#F4F4F2',
  primaryPressed: '#D8D8D5',
  onPrimary: '#171717',

  warning: '#E5B95C',
  warningMuted: '#3A301C',

  destructive: '#F97066',
  destructiveSurface: '#B42318',
  destructiveSurfacePressed: '#912018',
  destructiveMuted: '#3B1D1B',
  onDestructive: '#FFFFFF',
};

export const eventColors = {
  blue: {
    light: '#5B7FA6',
    dark: '#8FB3D9',
  },
  green: {
    light: '#6F8A62',
    dark: '#9DBB8F',
  },
  rose: {
    light: '#A86673',
    dark: '#D995A3',
  },
  amber: {
    light: '#B0894A',
    dark: '#D6B36E',
  },
  violet: {
    light: '#7B6FA8',
    dark: '#A99CE0',
  },
  teal: {
    light: '#5C8F8A',
    dark: '#8FC4BE',
  },
  cyan: {
    light: '#5F8FA3',
    dark: '#93C6D9',
  },
  coral: {
    light: '#B06D61',
    dark: '#D99A90',
  },
  olive: {
    light: '#7C8753',
    dark: '#AEB97A',
  },
  brown: {
    light: '#8B6A58',
    dark: '#BE9782',
  },
  slate: {
    light: '#6F7A88',
    dark: '#A3AFBD',
  },
  navy: {
    light: '#556C93',
    dark: '#88A4CF',
  },
  magenta: {
    light: '#9C668E',
    dark: '#CB98BE',
  },
};
