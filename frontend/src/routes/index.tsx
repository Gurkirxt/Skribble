import { useState, useMemo, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { createAvatar } from "@dicebear/core";
import * as avataaars from "@dicebear/avataaars";

export const Route = createFileRoute("/")({ component: MainPage });

const TRAITS = {
	top: ["dreads01", "dreads02", "frizzle", "shaggy", "shaggyMullet", "shortCurly", "shortFlat", "shortRound", "shortWaved", "sides", "theCaesar", "theCaesarAndSidePart", "bigHair", "bob", "bun", "curly", "curvy", "dreads", "frida", "fro", "froBand", "longButNotTooLong", "miaWallace", "shavedSides", "straight02", "straight01", "straightAndStrand", "hat", "hijab", "turban", "winterHat1", "winterHat02", "winterHat03", "winterHat04"],
	eyes: ["default", "happy", "wink", "surprised", "squint", "side", "eyeRoll", "cry", "closed", "hearts", "winkWacky", "xDizzy"],
	mouth: ["default", "smile", "twinkle", "tongue", "eating", "grimace", "serious", "disbelief", "concerned", "sad", "screamOpen", "vomit"],
	clothing: ["blazerAndShirt", "blazerAndSweater", "collarAndSweater", "graphicShirt", "hoodie", "overall", "shirtCrewNeck", "shirtScoopNeck", "shirtVNeck"],
	clothesColor: ["262e33", "65c9ff", "5199e4", "25557c", "e6e6e6", "929598", "3c4f5c", "b1e2ff", "a7ffc4", "ffafb9", "ffffb1", "ff488e", "ff5c5c", "ffffff"],
	skinColor: ["614335", "d08b5b", "ae5d29", "edb98a", "ffdbb4", "fd9841", "f8d25c"]
} as const;

type TraitName = keyof typeof TRAITS;

function MainPage() {
	const navigate = useNavigate();
	const [showJoin, setShowJoin] = useState(false);
	const [code, setCode] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	
	const [username, setUsername] = useState("");
	const [usernameError, setUsernameError] = useState(false);

	const [traitIndices, setTraitIndices] = useState<Record<TraitName, number>>({
		top: 0,
		eyes: 0,
		mouth: 0,
		clothing: 0,
		clothesColor: 0,
		skinColor: 0,
	});

	const avatarConfig = useMemo(() => {
		return {
			top: [TRAITS.top[traitIndices.top]],
			eyes: [TRAITS.eyes[traitIndices.eyes]],
			mouth: [TRAITS.mouth[traitIndices.mouth]],
			clothing: [TRAITS.clothing[traitIndices.clothing]],
			clothesColor: [TRAITS.clothesColor[traitIndices.clothesColor]],
			skinColor: [TRAITS.skinColor[traitIndices.skinColor]],
		};
	}, [traitIndices]);

	const avatarUri = useMemo(() => {
		const avatar = createAvatar(avataaars, avatarConfig);
		return avatar.toDataUri();
	}, [avatarConfig]);

	function handleTraitChange(trait: TraitName, direction: 1 | -1) {
		setTraitIndices((prev) => {
			const max = TRAITS[trait].length;
			let nextIndex = prev[trait] + direction;
			if (nextIndex < 0) nextIndex = max - 1;
			if (nextIndex >= max) nextIndex = 0;
			return { ...prev, [trait]: nextIndex };
		});
	}

	function validateAndSave(): boolean {
		if (!username.trim()) {
			setUsernameError(true);
			toast.error("Please enter a username");
			return false;
		}
		setUsernameError(false);
		localStorage.setItem("skribble_username", username.trim());
		localStorage.setItem("skribble_avatar", JSON.stringify(avatarConfig));
		return true;
	}

	async function handleCreateRoom() {
		if (!validateAndSave()) return;
		try {
			setIsLoading(true);
			const res = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/rooms`);
			if (res.data && res.data.code) {
				navigate({ to: "/game", search: { code: res.data.code } });
			}
		} catch (error) {
			console.error("Failed to create room:", error);
			toast.error("Failed to create room");
		} finally {
			setIsLoading(false);
		}
	}

	async function handlePlayGame() {
		if (!validateAndSave()) return;
		try {
			setIsLoading(true);
			const res = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/rooms`);
			const rooms = res.data;
			if (rooms && rooms.length > 0) {
				const availableRoom = rooms.find((r: any) => r.players < r.maxPlayers);
				if (availableRoom) {
					navigate({ to: "/game", search: { code: availableRoom.code } });
					return;
				}
			}
			handleCreateRoom();
		} catch (error) {
			console.error("Failed to fetch rooms:", error);
			toast.error("Failed to find a game");
			setIsLoading(false);
		}
	}

	function handleJoinSubmit() {
		if (!validateAndSave()) return;
		if (code.length === 6) {
			navigate({ to: "/game", search: { code } });
		}
	}

	return (
		<div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 gap-8">
			<div className="text-center space-y-2 mb-4">
				<h1 className="text-6xl font-extrabold tracking-tight text-foreground">
					Skribble
				</h1>
				<p className="text-muted-foreground text-lg">
					Draw, guess, and have fun with friends
				</p>
			</div>

			<div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl justify-center items-stretch">
				{/* Left Column: Avatar & Username */}
				<div className="flex-1 max-w-sm rounded-xl border bg-card p-6 shadow-sm flex flex-col items-center gap-6">
					<div className="flex w-full items-center justify-between">
						{/* Left arrows */}
						<div className="flex flex-col gap-2">
							{(Object.keys(TRAITS) as TraitName[]).map((trait) => (
								<Button key={`left-${trait}`} variant="ghost" size="icon" onClick={() => handleTraitChange(trait, -1)}>
									<ChevronLeft className="h-5 w-5" />
								</Button>
							))}
						</div>
						
						{/* Avatar preview */}
						<div className="w-48 h-48 bg-muted rounded-full overflow-hidden border-4 border-background shadow-inner">
							<img src={avatarUri} alt="Avatar Preview" className="w-full h-full object-cover" />
						</div>

						{/* Right arrows */}
						<div className="flex flex-col gap-2">
							{(Object.keys(TRAITS) as TraitName[]).map((trait) => (
								<Button key={`right-${trait}`} variant="ghost" size="icon" onClick={() => handleTraitChange(trait, 1)}>
									<ChevronRight className="h-5 w-5" />
								</Button>
							))}
						</div>
					</div>

					<div className="w-full space-y-2 mt-4">
						<Label htmlFor="username" className={usernameError ? "text-destructive" : ""}>Username</Label>
						<Input 
							id="username"
							placeholder="Enter your name..." 
							value={username}
							onChange={(e) => {
								setUsername(e.target.value);
								if (e.target.value.trim()) setUsernameError(false);
							}}
							className={usernameError ? "border-destructive focus-visible:ring-destructive" : ""}
							maxLength={20}
						/>
						{usernameError && <p className="text-xs text-destructive">Username is required to play.</p>}
					</div>
				</div>

				{/* Right Column: Actions */}
				<div className="flex-1 max-w-sm rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-center gap-4">
					<Button
						size="lg"
						className="w-full text-lg h-14"
						onClick={handlePlayGame}
						disabled={isLoading}
					>
						Play Game
					</Button>

					<Button
						size="lg"
						variant="secondary"
						className="w-full text-lg h-14"
						onClick={handleCreateRoom}
						disabled={isLoading}
					>
						Create Room
					</Button>

					<Button
						size="lg"
						variant="outline"
						className="w-full text-lg h-14"
						onClick={() => setShowJoin((v) => !v)}
						disabled={isLoading}
					>
						Join Room
					</Button>

					{showJoin && (
						<div className="flex flex-col items-center gap-4 pt-4 mt-2 border-t border-border">
							<p className="text-sm text-muted-foreground font-medium">
								Enter your 6-digit room code
							</p>
							<InputOTP
								maxLength={6}
								value={code}
								onChange={(val) => setCode(val.toUpperCase())}
								pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
								inputMode="text"
								type="text"
							>
								<InputOTPGroup>
									<InputOTPSlot index={0} className="h-12 w-12 text-base uppercase" />
									<InputOTPSlot index={1} className="h-12 w-12 text-base uppercase" />
									<InputOTPSlot index={2} className="h-12 w-12 text-base uppercase" />
									<InputOTPSlot index={3} className="h-12 w-12 text-base uppercase" />
									<InputOTPSlot index={4} className="h-12 w-12 text-base uppercase" />
									<InputOTPSlot index={5} className="h-12 w-12 text-base uppercase" />
								</InputOTPGroup>
							</InputOTP>
							<Button
								size="lg"
								className="w-full mt-2"
								disabled={code.length < 6 || isLoading}
								onClick={handleJoinSubmit}
							>
								Join Room
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
