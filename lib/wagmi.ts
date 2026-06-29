import { createConfig, http } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { ritualChain } from "./ritual";

export const wagmiConfig = createConfig({
  chains: [ritualChain],
  connectors: [metaMask()],
  transports: {
    [ritualChain.id]: http("https://rpc.ritualfoundation.org"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
