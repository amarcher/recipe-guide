import {
  Flame,
  Soup,
  Waves,
  Cookie,
  ChefHat,
  Wine,
  Leaf,
  Utensils,
  Snowflake,
  Hand,
  Blend,
  CookingPot,
  type LucideIcon,
} from "lucide-react";
import type { StepIcon as StepIconKey } from "@/app/types";

const MAP: Record<StepIconKey, LucideIcon> = {
  flame: Flame,
  soup: CookingPot,
  boil: Waves,
  oven: Cookie,
  knife: ChefHat,
  wine: Wine,
  leaf: Leaf,
  mix: Soup,
  salt: Hand,
  rest: Snowflake,
  serve: Utensils,
  blend: Blend,
};

export function StepIcon({
  name,
  className,
}: {
  name: StepIconKey;
  className?: string;
}) {
  const Icon = MAP[name] ?? Flame;
  return <Icon className={className} aria-hidden="true" />;
}
