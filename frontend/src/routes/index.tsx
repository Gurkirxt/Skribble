import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";

export const Route = createFileRoute("/")({ component: MainPage });

function MainPage() {
	const navigate = useNavigate();
	const [showJoin, setShowJoin] = useState(false);
	const [code, setCode] = useState("");

	function handleJoinSubmit() {
		if (code.length === 6) {
			navigate({ to: "/game", search: { code } });
		}
	}

	return (
		<div className="min-h-screen flex flex-col items-center justify-center bg-background gap-10">
			<div className="text-center space-y-2">
				<h1 className="text-6xl font-extrabold tracking-tight text-foreground">
					Skribble
				</h1>
				<p className="text-muted-foreground text-lg">
					Draw, guess, and have fun with friends
				</p>
			</div>

			<div className="flex flex-col items-center gap-4 w-full max-w-xs">
				<Button
					size="lg"
					className="w-full text-base"
					onClick={() => navigate({ to: "/game" })}
				>
					Play Game
				</Button>

				<Button
					size="lg"
					variant="secondary"
					className="w-full text-base"
					onClick={() => navigate({ to: "/game" })}
				>
					Create Room
				</Button>

				<Button
					size="lg"
					variant="outline"
					className="w-full text-base"
					onClick={() => setShowJoin((v) => !v)}
				>
					Join Room
				</Button>

				{showJoin && (
					<div className="flex flex-col items-center gap-4 pt-2 w-full border rounded-xl p-6 bg-card shadow-sm">
						<p className="text-sm text-muted-foreground font-medium">
							Enter your 6-digit room code
						</p>
						<InputOTP
							maxLength={6}
							value={code}
							onChange={setCode}
							pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
						>
							<InputOTPGroup>
								<InputOTPSlot index={0} className="h-12 w-12 text-base" />
								<InputOTPSlot index={1} className="h-12 w-12 text-base" />
								<InputOTPSlot index={2} className="h-12 w-12 text-base" />
								<InputOTPSlot index={3} className="h-12 w-12 text-base" />
								<InputOTPSlot index={4} className="h-12 w-12 text-base" />
								<InputOTPSlot index={5} className="h-12 w-12 text-base" />
							</InputOTPGroup>
						</InputOTP>
						<Button
							className="w-full"
							disabled={code.length < 6}
							onClick={handleJoinSubmit}
						>
							Join Room
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
