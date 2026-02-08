import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Home,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
} from "lucide-react";

interface PTZControlsProps {
  onMove?: (direction: number) => void;
}

export function PTZControls({ onMove }: PTZControlsProps) {
  const btn =
    "flex items-center justify-center rounded-md bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground active:scale-95 transition-all duration-150 h-10 w-10";

  const fire = (dir: number) => onMove?.(dir);

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
        Position Control
      </h3>
      <div className="grid grid-cols-3 gap-1.5 w-fit">
        <button className={btn} onClick={() => fire(0)}><ArrowUpLeft className="h-4 w-4" /></button>
        <button className={btn} onClick={() => fire(1)}><ArrowUp className="h-4 w-4" /></button>
        <button className={btn} onClick={() => fire(2)}><ArrowUpRight className="h-4 w-4" /></button>
        <button className={btn} onClick={() => fire(3)}><ArrowLeft className="h-4 w-4" /></button>
        <button className={`${btn} bg-primary/20 text-primary hover:bg-primary hover:text-primary-foreground`} onClick={() => fire(4)}><Home className="h-4 w-4" /></button>
        <button className={btn} onClick={() => fire(5)}><ArrowRight className="h-4 w-4" /></button>
        <button className={btn} onClick={() => fire(6)}><ArrowDownLeft className="h-4 w-4" /></button>
        <button className={btn} onClick={() => fire(7)}><ArrowDown className="h-4 w-4" /></button>
        <button className={btn} onClick={() => fire(8)}><ArrowDownRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
