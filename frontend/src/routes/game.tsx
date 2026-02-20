import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/game")({ component: Game });

function Game() {
	return <div>hi</div>;
}
