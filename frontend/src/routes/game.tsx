import { useEffect, useRef, useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	Pencil,
	PaintBucket,
	Eraser,
	Undo2,
	SendHorizonal,
	Copy,
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createAvatar } from "@dicebear/core";
import * as avataaars from "@dicebear/avataaars";
import { cn } from "@/lib/utils";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

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

type Tool = "pencil" | "fill" | "eraser";

interface StrokePoint {
	x: number;
	y: number;
}

interface Stroke {
	id: string;
	penType: "pen" | "fill" | "eraser";
	color: string;
	size: number;
	points: StrokePoint[];
	fillTarget?: StrokePoint;
}

interface Player {
	uid: string;
	socketId: string;
	username: string;
	avatar?: Record<string, string[]>;
	hasAnswered: boolean;
	score: number;
	connected: boolean;
	joinTime: number;
}

interface RoomConfig {
	isPublic: boolean;
	drawTime: number;
	maxPlayers: number;
	rounds: number;
	wordChoicesCount: number;
	hintsEnabled: boolean;
}

function hexToRgb(hex: string) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result
		? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16),
				a: 255,
			}
		: { r: 0, g: 0, b: 0, a: 255 };
}

function floodFill(
	ctx: CanvasRenderingContext2D,
	startX: number,
	startY: number,
	fillColorHex: string
) {
	const canvas = ctx.canvas;
	const width = canvas.width;
	const height = canvas.height;
	const imageData = ctx.getImageData(0, 0, width, height);
	const data = imageData.data;

	const targetX = Math.round(startX);
	const targetY = Math.round(startY);

	if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) return;

	const targetIndex = (targetY * width + targetX) * 4;
	const startR = data[targetIndex];
	const startG = data[targetIndex + 1];
	const startB = data[targetIndex + 2];
	const startA = data[targetIndex + 3];

	const fillColor = hexToRgb(fillColorHex);

	if (
		startR === fillColor.r &&
		startG === fillColor.g &&
		startB === fillColor.b &&
		startA === fillColor.a
	) {
		return;
	}

	const stack = [[targetX, targetY]];
	
	function matchStartColor(x: number, y: number) {
		const idx = (y * width + x) * 4;
		return (
			data[idx] === startR &&
			data[idx + 1] === startG &&
			data[idx + 2] === startB &&
			data[idx + 3] === startA
		);
	}

	function colorPixel(x: number, y: number) {
		const idx = (y * width + x) * 4;
		data[idx] = fillColor.r;
		data[idx + 1] = fillColor.g;
		data[idx + 2] = fillColor.b;
		data[idx + 3] = 255;
	}

	while (stack.length > 0) {
		const [x, y] = stack.pop()!;
		let currentX = x;
		let currentY = y;

		while (currentY >= 0 && matchStartColor(currentX, currentY)) {
			currentY--;
		}
		currentY++;

		let spanLeft = false;
		let spanRight = false;

		while (currentY < height && matchStartColor(currentX, currentY)) {
			colorPixel(currentX, currentY);

			if (currentX > 0) {
				if (matchStartColor(currentX - 1, currentY)) {
					if (!spanLeft) {
						stack.push([currentX - 1, currentY]);
						spanLeft = true;
					}
				} else if (spanLeft) {
					spanLeft = false;
				}
			}

			if (currentX < width - 1) {
				if (matchStartColor(currentX + 1, currentY)) {
					if (!spanRight) {
						stack.push([currentX + 1, currentY]);
						spanRight = true;
					}
				} else if (spanRight) {
					spanRight = false;
				}
			}

			currentY++;
		}
	}

	ctx.putImageData(imageData, 0, 0);
}

function renderStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

	for (const stroke of strokes) {
		if (stroke.penType === "fill" && stroke.fillTarget) {
			floodFill(ctx, stroke.fillTarget.x, stroke.fillTarget.y, stroke.color);
			continue;
		}

		if (stroke.points.length === 0) continue;

		ctx.beginPath();
		ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
		for (let i = 1; i < stroke.points.length; i++) {
			ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
		}
		ctx.strokeStyle = stroke.penType === "eraser" ? "#ffffff" : stroke.color;
		ctx.lineWidth = stroke.size;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.stroke();
	}
}

function GamePage() {
	const navigate = useNavigate();
	const { code } = Route.useSearch();

	const [socket, setSocket] = useState<Socket | null>(null);
	const [uid] = useState(() => crypto.randomUUID());
	const [username, setUsername] = useState("");
	const [avatarConfig, setAvatarConfig] = useState<Record<string, string[]> | null>(null);
	const [hasJoined, setHasJoined] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// Load from localStorage
	useEffect(() => {
		const storedName = localStorage.getItem("skribble_username");
		const storedAvatar = localStorage.getItem("skribble_avatar");

		if (!storedName || !storedAvatar) {
			navigate({ to: "/" });
			return;
		}

		setUsername(storedName);
		setAvatarConfig(JSON.parse(storedAvatar));
	}, [navigate]);

	const [players, setPlayers] = useState<Player[]>([]);
	const [messages, setMessages] = useState<
		{ id: string; author: string; text: string; guessed: boolean; uid?: string }[]
	>([]);
	const [gameState, setGameState] = useState<string>("waiting");
	const [config, setConfig] = useState<RoomConfig | null>(null);
	const [hostUid, setHostUid] = useState<string | null>(null);
	const [drawerUid, setDrawerUid] = useState<string | null>(null);
	const [, setStrokes] = useState<Stroke[]>([]);
	const [currentWord, setCurrentWord] = useState<string | null>(null);
	const [wordChoices, setWordChoices] = useState<string[]>([]);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isDrawing, setIsDrawing] = useState(false);
	const [activeTool, setActiveTool] = useState<Tool>("pencil");
	const [activeColor, setActiveColor] = useState(COLORS[0]);
	const [chatInput, setChatInput] = useState("");
	const [timeLeft, setTimeLeft] = useState(0);

	const [showLeaveDialog, setShowLeaveDialog] = useState(false);

	const currentStrokeId = useRef<string | null>(null);
	const currentStrokePoints = useRef<StrokePoint[]>([]);

	// Initial Socket Setup
	useEffect(() => {
		if (!code) {
			setErrorMessage("No room code provided.");
			return;
		}

		const newSocket = io("http://localhost:8080");
		setSocket(newSocket);

		return () => {
			newSocket.disconnect();
		};
	}, [code]);

	// Setup Socket Listeners
	useEffect(() => {
		if (!socket) return;

		socket.on("roomState", (state) => {
			setPlayers(state.players);
			setGameState(state.gameState);
			setConfig(state.config);
			setHostUid(state.hostUid);
			setDrawerUid(state.drawerUid);
			setStrokes(state.strokes || []);
			if (state.strokes && canvasRef.current) {
				renderStrokes(canvasRef.current.getContext("2d")!, state.strokes);
			}
		});

		socket.on("playerJoined", (player: Player) => {
			setPlayers((prev) => [...prev.filter((p) => p.uid !== player.uid), player]);
			toast.success(`${player.username} joined the room`);
		});

		socket.on("playerDisconnected", ({ uid }) => {
			setPlayers((prev) =>
				prev.map((p) => (p.uid === uid ? { ...p, connected: false } : p))
			);
			const p = players.find((pl) => pl.uid === uid);
			if (p) {
				toast.info(`${p.username} disconnected`);
			}
		});

		socket.on("playerReconnected", ({ uid, username }) => {
			setPlayers((prev) =>
				prev.map((p) => (p.uid === uid ? { ...p, connected: true } : p))
			);
			toast.success(`${username} reconnected`);
		});

		socket.on("hostChanged", ({ hostUid: newHostUid }) => {
			setHostUid(newHostUid);
		});

		socket.on("configUpdated", ({ config: newConfig }) => {
			setConfig(newConfig);
		});

		socket.on("drawerChange", ({ drawerUid: newDrawerUid }) => {
			setDrawerUid(newDrawerUid);
		});

		socket.on("chat", (msg: { message: string; username: string; uid: string; isAnswered: boolean }) => {
			setMessages((prev) => [
				...prev,
				{
					id: String(Date.now() + Math.random()),
					author: msg.username,
					text: msg.message,
					guessed: msg.isAnswered,
					uid: msg.uid,
				},
			]);
		});

		socket.on("stroke", ({ stroke }) => {
			setStrokes((prev) => {
				const next = [...prev, stroke];
				if (canvasRef.current) {
					renderStrokes(canvasRef.current.getContext("2d")!, next);
				}
				return next;
			});
		});

		socket.on("canvasUpdate", ({ strokes: newStrokes }) => {
			setStrokes(newStrokes);
			if (canvasRef.current) {
				renderStrokes(canvasRef.current.getContext("2d")!, newStrokes);
			}
		});

		socket.on("wordChoices", ({ choices }) => {
			setWordChoices(choices);
			setGameState("choosing_word");
		});

		socket.on("wordChosen", ({ word }) => {
			setCurrentWord(word);
			setGameState("playing");
		});

		socket.on("hint", ({ hint }) => {
			setCurrentWord(hint);
		});

		socket.on("turnStart", ({ drawerUid: newDrawerUid }) => {
			setDrawerUid(newDrawerUid);
			setGameState("choosing_word");
			setCurrentWord(null);
			setWordChoices([]);
			if (canvasRef.current) {
				const ctx = canvasRef.current.getContext("2d");
				if (ctx) {
					ctx.fillStyle = "white";
					ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
				}
			}
		});

		socket.on("turnEnd", ({ word }) => {
			setCurrentWord(word);
			setGameState("round_end");
		});

		socket.on("gameOver", () => {
			setGameState("game_over");
		});

		socket.on("playerAnswered", ({ uid, username, score }) => {
			setPlayers((prev) =>
				prev.map((p) => (p.uid === uid ? { ...p, hasAnswered: true, score } : p))
			);
			setMessages((prev) => [
				...prev,
				{
					id: String(Date.now() + Math.random()),
					author: "System",
					text: `${username} guessed the word!`,
					guessed: true,
				},
			]);
		});

		socket.on("error", ({ message }) => {
			setErrorMessage(message);
		});

		return () => {
			socket.off("roomState");
			socket.off("playerJoined");
			socket.off("playerDisconnected");
			socket.off("playerReconnected");
			socket.off("hostChanged");
			socket.off("configUpdated");
			socket.off("drawerChange");
			socket.off("chat");
			socket.off("stroke");
			socket.off("canvasUpdate");
			socket.off("playerAnswered");
			socket.off("error");
		};
	}, [socket, players]);

	useEffect(() => {
		if (socket && code && username && avatarConfig && !hasJoined) {
			socket.emit("join", { roomCode: code, uid, username, avatar: avatarConfig });
			setHasJoined(true);
		}
	}, [socket, code, username, avatarConfig, uid, hasJoined]);

	// Timer mockup for now
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
		if (drawerUid !== uid || gameState !== "playing") return;

		const { x, y } = getPos(e);
		
		if (activeTool === "fill") {
			const stroke: Stroke = {
				id: crypto.randomUUID(),
				penType: "fill",
				color: activeColor,
				size: 0,
				points: [],
				fillTarget: { x, y },
			};
			socket?.emit("stroke", { stroke });
			setStrokes((prev) => {
				const next = [...prev, stroke];
				if (canvasRef.current) {
					renderStrokes(canvasRef.current.getContext("2d")!, next);
				}
				return next;
			});
			return;
		}

		setIsDrawing(true);
		currentStrokeId.current = crypto.randomUUID();
		currentStrokePoints.current = [{ x, y }];

		const ctx = canvasRef.current!.getContext("2d")!;
		ctx.beginPath();
		ctx.moveTo(x, y);
	}

	function draw(e: React.MouseEvent<HTMLCanvasElement>) {
		// When mouse enters while holding button, continue drawing
		if (e.buttons === 1 && !isDrawing && activeTool !== "fill") {
			startDraw(e);
			return;
		}

		if (!isDrawing || drawerUid !== uid || gameState !== "playing" || activeTool === "fill") return;
		const ctx = canvasRef.current!.getContext("2d")!;
		const { x, y } = getPos(e);
		
		currentStrokePoints.current.push({ x, y });

		ctx.lineTo(x, y);
		ctx.strokeStyle = activeTool === "eraser" ? "#ffffff" : activeColor;
		ctx.lineWidth = activeTool === "eraser" ? 24 : 4;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.stroke();
	}

	function stopDraw() {
		if (!isDrawing) return;
		setIsDrawing(false);

		if (currentStrokeId.current && currentStrokePoints.current.length > 0) {
			const stroke: Stroke = {
				id: currentStrokeId.current,
				penType: activeTool === "eraser" ? "eraser" : "pen",
				color: activeColor,
				size: activeTool === "eraser" ? 24 : 4,
				points: currentStrokePoints.current,
			};
			socket?.emit("stroke", { stroke });
			setStrokes((prev) => [...prev, stroke]);
		}
		
		currentStrokeId.current = null;
		currentStrokePoints.current = [];
	}

	function handleUndo() {
		if (drawerUid !== uid) return;
		socket?.emit("undo");
	}

	function sendChat() {
		const text = chatInput.trim();
		if (!text || !socket) return;
		
		socket.emit("chat", { message: text });
		setChatInput("");
	}

	function copyRoomCode() {
		if (code) {
			navigator.clipboard.writeText(code);
			toast.success("Room code copied to clipboard!");
		}
	}

	function updateConfig(newConfig: Partial<RoomConfig>) {
		if (hostUid === uid) {
			socket?.emit("updateConfig", newConfig);
		}
	}

	function startGame() {
		if (hostUid === uid) {
			socket?.emit("startGame");
		}
	}

	function chooseWord(word: string) {
		socket?.emit("chooseWord", { word });
		setWordChoices([]);
	}

	if (errorMessage) {
		return (
			<div className="h-screen flex items-center justify-center bg-background">
				<div className="bg-card p-8 rounded-xl border flex flex-col items-center gap-6 w-full max-w-md shadow-lg">
					<h2 className="text-3xl font-bold text-destructive text-center">Oops!</h2>
					<p className="text-center text-lg text-foreground">{errorMessage}</p>
					<Button size="lg" className="w-full mt-4" onClick={() => navigate({ to: "/" })}>
						Back to Main Menu
					</Button>
				</div>
			</div>
		);
	}

	if (!hasJoined) {
		return (
			<div className="h-screen flex items-center justify-center bg-background">
				<div className="text-2xl font-bold animate-pulse text-foreground">Joining Room...</div>
			</div>
		);
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
							{players
								.sort((a, b) => b.score - a.score)
								.map((p) => (
								<div
									key={p.uid}
									className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors"
								>
									<div className="relative">
										<Avatar className="h-9 w-9">
											{p.avatar && (
												<AvatarImage src={createAvatar(avataaars, p.avatar).toDataUri()} alt={p.username} />
											)}
											<AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
												{p.username.slice(0, 2).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<span
											className={cn(
												"absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
												p.connected ? "bg-green-500" : "bg-muted-foreground",
											)}
										/>
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium truncate text-foreground flex items-center gap-1">
											{p.username}
											{p.uid === drawerUid && <Pencil className="h-3 w-3 text-muted-foreground" />}
										</p>
										<p className="text-xs text-muted-foreground">
											{p.score} pts
										</p>
									</div>
								</div>
							))}
						</div>
					</ScrollArea>
				</div>
			</div>

			{/* ── Center: Canvas/Config ── */}
			<div className="flex-1 flex flex-col gap-3 min-w-0">
				{/* Word / Status */}
				<div className="rounded-xl border bg-card px-6 py-3 flex items-center justify-center">
					<span className="font-bold text-lg tracking-wide text-foreground">
						{gameState === "waiting" && "Waiting for players..."}
						{gameState === "choosing_word" && (uid === drawerUid ? "Choose a word!" : "Drawer is choosing a word...")}
						{gameState === "playing" && (
							<>
								{uid === drawerUid ? "Draw: " : "Guess the word: "}
								<span className="text-primary uppercase">{currentWord || "???"}</span>
							</>
						)}
						{gameState === "round_end" && "Round ended!"}
						{gameState === "game_over" && "Game Over!"}
					</span>
				</div>

				{gameState === "choosing_word" && uid === drawerUid && wordChoices.length > 0 ? (
					<div className="flex-1 rounded-xl border bg-card overflow-hidden flex flex-col items-center justify-center p-8 gap-6">
						<h2 className="text-3xl font-bold">Choose a word</h2>
						<div className="flex gap-4">
							{wordChoices.map(w => (
								<Button key={w} size="lg" onClick={() => chooseWord(w)}>{w}</Button>
							))}
						</div>
					</div>
				) : gameState === "waiting" ? (
					/* Configuration Screen */
					<div className="flex-1 rounded-xl border bg-card overflow-hidden flex flex-col items-center justify-center p-8">
						<h2 className="text-3xl font-bold mb-8">Room Configuration</h2>
						
						{config && (
							<div className="w-full max-w-md space-y-8">
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<Label>Draw Time (seconds)</Label>
										<span className="font-medium">{config.drawTime}</span>
									</div>
									<Slider 
										value={[config.drawTime]} 
										onValueChange={([v]) => updateConfig({ drawTime: v })} 
										min={30} max={180} step={10} 
										disabled={hostUid !== uid}
									/>
								</div>

								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<Label>Rounds</Label>
										<span className="font-medium">{config.rounds}</span>
									</div>
									<Slider 
										value={[config.rounds]} 
										onValueChange={([v]) => updateConfig({ rounds: v })} 
										min={1} max={10} step={1} 
										disabled={hostUid !== uid}
									/>
								</div>
								
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<Label>Max Players</Label>
										<span className="font-medium">{config.maxPlayers}</span>
									</div>
									<Slider 
										value={[config.maxPlayers]} 
										onValueChange={([v]) => updateConfig({ maxPlayers: v })} 
										min={2} max={20} step={1} 
										disabled={hostUid !== uid}
									/>
								</div>

								<div className="flex items-center justify-between">
									<div className="space-y-0.5">
										<Label>Public Room</Label>
										<p className="text-sm text-muted-foreground">Allow random players to join</p>
									</div>
									<Switch 
										checked={config.isPublic} 
										onCheckedChange={(v) => updateConfig({ isPublic: v })} 
										disabled={hostUid !== uid}
									/>
								</div>
							</div>
						)}

						{hostUid === uid && (
							<Button size="lg" className="mt-12 w-full max-w-md" onClick={startGame}>
								Start Game
							</Button>
						)}
						{hostUid !== uid && (
							<p className="mt-12 text-muted-foreground">Waiting for host to start the game...</p>
						)}
					</div>
				) : (
					/* Canvas */
					<>
						<div className="flex-1 rounded-xl border bg-card overflow-hidden">
							<canvas
								ref={canvasRef}
								width={1200}
								height={900}
								className={cn(
									"w-full h-full cursor-crosshair",
									uid !== drawerUid && "pointer-events-none"
								)}
								onMouseDown={startDraw}
								onMouseMove={draw}
								onMouseUp={stopDraw}
								onMouseLeave={stopDraw}
							/>
						</div>

						{/* Toolbar */}
						<div className={cn(
							"rounded-xl border bg-card px-4 py-3 flex items-center gap-3 transition-opacity",
							uid !== drawerUid && "opacity-50 pointer-events-none"
						)}>
							{/* Color swatches */}
							<div className="flex items-center gap-1.5">
								{COLORS.map((c) => (
									<button
										key={c}
										type="button"
										onClick={() => {
											setActiveColor(c);
											if (activeTool === "eraser") setActiveTool("pencil");
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
									variant={activeTool === "pencil" ? "default" : "outline"}
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
									variant={activeTool === "eraser" ? "default" : "outline"}
									onClick={() => setActiveTool("eraser")}
								>
									<Eraser />
								</Button>
								<Button size="icon" variant="outline" onClick={handleUndo}>
									<Undo2 />
								</Button>
							</div>
						</div>
					</>
				)}
			</div>

			{/* ── Right: Chat & Controls ── */}
			<div className="w-64 flex flex-col gap-3 shrink-0">
				{/* Top Controls: Room Code and Leave */}
				<div className="flex flex-col gap-2">
					<Button
						variant="outline"
						size="sm"
						className="w-full flex items-center gap-2"
						onClick={copyRoomCode}
					>
						<Copy className="h-4 w-4" />
						Room Code: {code}
					</Button>
					
					<Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
						<DialogTrigger asChild>
							<Button variant="destructive" size="sm" className="w-full">
								Leave game
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Leave game?</DialogTitle>
								<DialogDescription>
									Are you sure you want to leave the game? You will be disconnected from the room.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter className="gap-2 sm:gap-0">
								<Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
									Cancel
								</Button>
								<Button variant="destructive" onClick={() => navigate({ to: "/" })}>
									Leave Game
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>

				{/* Chat panel */}
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
									{msg.guessed && msg.author !== "System" ? `Guessed: ${msg.text}` : msg.text}
								</div>
							))}
						</div>
					</ScrollArea>
				</div>

				{/* Chat input */}
				<div className="flex gap-2">
					<Input
						placeholder={uid === drawerUid && gameState === "playing" ? "Drawers can't guess!" : "Type a guess..."}
						value={chatInput}
						onChange={(e) => setChatInput(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && sendChat()}
						disabled={uid === drawerUid && gameState === "playing"}
					/>
					<Button size="icon" onClick={sendChat} disabled={uid === drawerUid && gameState === "playing"}>
						<SendHorizonal />
					</Button>
				</div>
			</div>
		</div>
	);
}
