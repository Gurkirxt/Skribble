import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	Pencil,
	PaintBucket,
	Eraser,
	RotateCcw,
	SendHorizonal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/game")({
	validateSearch: (search: Record<string, unknown>) => ({
		code: typeof search.code === "string" ? search.code : undefined,
	}),
	component: GamePage,
});

const COLORS = [
	"#22d3ee",
	"#4ade80",
	"#facc15",
	"#f87171",
	"#c084fc",
	"#fb923c",
	"#ffffff",
	"#1e293b",
];

const MOCK_PLAYERS = [
	{ id: "1", name: "PlayerOne", points: 120, online: true },
	{ id: "2", name: "Mia", points: 115, online: true },
	{ id: "3", name: "Alex", points: 90, online: true },
	{ id: "4", name: "Connection", points: 28, online: false },
];

const MOCK_MESSAGES = [
	{ id: "1", author: "Alex", text: "is that a cat?", guessed: false },
	{ id: "2", author: "PlayerOne", text: "looking good!", guessed: false },
	{ id: "3", author: "Mia", text: "Banana!", guessed: true },
];

type Tool = "pencil" | "fill" | "eraser";

function GamePage() {
	const navigate = useNavigate();
	const { code } = Route.useSearch();

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isDrawing, setIsDrawing] = useState(false);
	const [activeTool, setActiveTool] = useState<Tool>("pencil");
	const [activeColor, setActiveColor] = useState(COLORS[0]);
	const [chatInput, setChatInput] = useState("");
	const [messages, setMessages] =
		useState<typeof MOCK_MESSAGES>(MOCK_MESSAGES);
	const [timeLeft, setTimeLeft] = useState(75);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.fillStyle = "white";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}, []);

	useEffect(() => {
		if (timeLeft <= 0) return;
		const t = setTimeout(() => setTimeLeft((n) => n - 1), 1000);
		return () => clearTimeout(t);
	}, [timeLeft]);

	function getPos(e: React.MouseEvent<HTMLCanvasElement>) {
		const rect = canvasRef.current!.getBoundingClientRect();
		const scaleX = canvasRef.current!.width / rect.width;
		const scaleY = canvasRef.current!.height / rect.height;
		return {
			x: (e.clientX - rect.left) * scaleX,
			y: (e.clientY - rect.top) * scaleY,
		};
	}

	function startDraw(e: React.MouseEvent<HTMLCanvasElement>) {
		const ctx = canvasRef.current!.getContext("2d")!;
		const { x, y } = getPos(e);
		ctx.beginPath();
		ctx.moveTo(x, y);
		setIsDrawing(true);
	}

	function draw(e: React.MouseEvent<HTMLCanvasElement>) {
		if (!isDrawing) return;
		const ctx = canvasRef.current!.getContext("2d")!;
		const { x, y } = getPos(e);
		ctx.lineTo(x, y);
		ctx.strokeStyle = activeTool === "eraser" ? "#ffffff" : activeColor;
		ctx.lineWidth = activeTool === "eraser" ? 24 : 4;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.stroke();
	}

	function stopDraw() {
		setIsDrawing(false);
	}

	function clearCanvas() {
		const canvas = canvasRef.current!;
		const ctx = canvas.getContext("2d")!;
		ctx.fillStyle = "white";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}

	function sendChat() {
		const text = chatInput.trim();
		if (!text) return;
		setMessages((prev) => [
			...prev,
			{ id: String(Date.now()), author: "You", text, guessed: false },
		]);
		setChatInput("");
	}

	const minutes = String(Math.floor(timeLeft / 60)).padStart(2, "0");
	const seconds = String(timeLeft % 60).padStart(2, "0");

	return (
		<div className="h-screen flex gap-3 p-4 bg-background overflow-hidden">
			{/* ── Left: Timer + Players ── */}
			<div className="w-56 flex flex-col gap-3 shrink-0">
				{/* Timer */}
				<div className="rounded-xl border bg-card p-4 flex items-center justify-center">
					<span className="font-mono text-4xl font-bold tracking-widest tabular-nums text-foreground">
						{minutes}:{seconds}
					</span>
				</div>

				{/* Players */}
				<div className="rounded-xl border bg-card flex-1 overflow-hidden flex flex-col">
					<ScrollArea className="flex-1 p-3">
						<div className="flex flex-col gap-2">
							{MOCK_PLAYERS.map((p) => (
								<div
									key={p.id}
									className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors"
								>
									<div className="relative">
										<Avatar className="h-9 w-9">
											<AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
												{p.name.slice(0, 2).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<span
											className={cn(
												"absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
												p.online ? "bg-green-500" : "bg-muted-foreground",
											)}
										/>
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium truncate text-foreground">
											{p.name}
										</p>
										<p className="text-xs text-muted-foreground">
											{p.points} pts
										</p>
									</div>
								</div>
							))}
						</div>
					</ScrollArea>
				</div>
			</div>

			{/* ── Center: Canvas ── */}
			<div className="flex-1 flex flex-col gap-3 min-w-0">
				{/* Word */}
				<div className="rounded-xl border bg-card px-6 py-3 flex items-center justify-center">
					<span className="font-bold text-lg tracking-wide text-foreground">
						Draw:{" "}
						<span className="text-primary uppercase">Space Dino Party</span>
					</span>
				</div>

				{/* Canvas */}
				<div className="flex-1 rounded-xl border bg-card overflow-hidden">
					<canvas
						ref={canvasRef}
						width={1200}
						height={900}
						className="w-full h-full cursor-crosshair"
						onMouseDown={startDraw}
						onMouseMove={draw}
						onMouseUp={stopDraw}
						onMouseLeave={stopDraw}
					/>
				</div>

				{/* Toolbar */}
				<div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
					{/* Color swatches */}
					<div className="flex items-center gap-1.5">
						{COLORS.map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => {
									setActiveColor(c);
									setActiveTool("pencil");
								}}
								className={cn(
									"h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
									activeColor === c && activeTool !== "eraser"
										? "border-foreground scale-110"
										: "border-border",
								)}
								style={{ backgroundColor: c }}
							/>
						))}
					</div>

					<div className="ml-auto flex items-center gap-1">
						<Button
							size="icon"
							variant={
								activeTool === "pencil" ? "default" : "outline"
							}
							onClick={() => setActiveTool("pencil")}
						>
							<Pencil />
						</Button>
						<Button
							size="icon"
							variant={activeTool === "fill" ? "default" : "outline"}
							onClick={() => setActiveTool("fill")}
						>
							<PaintBucket />
						</Button>
						<Button
							size="icon"
							variant={
								activeTool === "eraser" ? "default" : "outline"
							}
							onClick={() => setActiveTool("eraser")}
						>
							<Eraser />
						</Button>
						<Button size="icon" variant="outline" onClick={clearCanvas}>
							<RotateCcw />
						</Button>
					</div>
				</div>
			</div>

			{/* ── Right: Chat ── */}
			<div className="w-64 flex flex-col gap-3 shrink-0">
				<div className="flex-1 rounded-xl border bg-card overflow-hidden flex flex-col">
					<ScrollArea className="flex-1 p-3">
						<div className="flex flex-col gap-2">
							{messages.map((msg) => (
								<div
									key={msg.id}
									className={cn(
										"rounded-lg px-3 py-2 text-sm",
										msg.guessed
											? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 font-semibold"
											: "bg-muted text-foreground",
									)}
								>
									{!msg.guessed && (
										<span className="font-semibold text-primary">
											{msg.author}:{" "}
										</span>
									)}
									{msg.guessed ? `Guessed: ${msg.text}` : msg.text}
								</div>
							))}
						</div>
					</ScrollArea>
				</div>

				{/* Chat input */}
				<div className="flex gap-2">
					<Input
						placeholder="Type a guess..."
						value={chatInput}
						onChange={(e) => setChatInput(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && sendChat()}
					/>
					<Button size="icon" onClick={sendChat}>
						<SendHorizonal />
					</Button>
				</div>

				<Button
					variant="ghost"
					size="sm"
					className="text-muted-foreground"
					onClick={() => navigate({ to: "/" })}
				>
					Leave game
				</Button>
			</div>
		</div>
	);
}
