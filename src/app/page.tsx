import { PublicLanding } from "@/components/public-landing";
// Keep the public page available to everyone, including signed-in workers.
export default function Landing() {
  return <PublicLanding />;
}
