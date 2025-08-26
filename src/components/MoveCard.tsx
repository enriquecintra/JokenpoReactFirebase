import { Card, CardActionArea, CardContent, Typography } from "@mui/material";
import type { MoveKey } from "@/types/game";

const map: Record<MoveKey, { label: string; emoji: string }> = {
  pedra: { label: "Pedra", emoji: "✊" },
  papel: { label: "Papel", emoji: "✋" },
  tesoura: { label: "Tesoura", emoji: "✌️" },
};

export default function MoveCard({
  move,
  selected,
  onClick,
}: {
  move: MoveKey;
  selected?: boolean;
  onClick?: () => void;
}) {
  const { label, emoji } = map[move];
  return (
    <Card
      variant={selected ? "elevation" : "outlined"}
      sx={{
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? "primary.main" : "divider",
      }}
    >
      <CardActionArea onClick={onClick}>
        <CardContent sx={{ textAlign: "center", py: 4 }}>
          <Typography variant="h3" component="div">
            {emoji}
          </Typography>
          <Typography variant="subtitle1" sx={{ mt: 1, fontWeight: 600 }}>
            {label}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
