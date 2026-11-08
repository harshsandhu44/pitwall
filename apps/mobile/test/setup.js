jest.mock("react-native-reanimated", () => require("./reanimated-mock"));
// Load it now, so expo-router/testing-library's own jest.mock finds this one already in the registry.
require("react-native-reanimated");
