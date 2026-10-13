jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Icon = (props: Record<string, unknown>) => React.createElement(View, { ...props, testID: "icon" });
  return {
    AlertTriangle: Icon,
    ChevronRight: Icon,
    ChevronLeft: Icon,
    ImageOff: Icon,
    Minus: Icon,
    Plus: Icon,
    Scan: Icon,
    X: Icon,
    Inbox: Icon,
    RefreshCw: Icon,
    WifiOff: Icon
  };
});

afterEach(() => {
  jest.restoreAllMocks();
});
