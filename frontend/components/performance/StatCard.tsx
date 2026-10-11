// components/performance/StatCard.tsx
// Um número do resumo, com rótulo e (quando ajuda) uma explicação.
//
// O rótulo é curto porque o número é o protagonista; a definição vai no `hint`, que é o
// que evita alguém interpretar "no prazo" do jeito errado.

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  /** Destaque para o número que mais importa na tela. */
  emphasis?: boolean;
}

export default function StatCard({ label, value, hint, emphasis }: StatCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          {hint && (
            <Tooltip title={hint}>
              <InfoOutlinedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
            </Tooltip>
          )}
        </Box>

        <Typography
          variant={emphasis ? 'h2' : 'h3'}
          component="p"
          sx={{ fontSize: emphasis ? '1.75rem' : '1.35rem', lineHeight: 1.2 }}
        >
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}
