// app/(app)/household/page.tsx
// A casa: quem mora nela, o que cada um pode fazer, e como convidar mais gente.
//
// LEITURA NO SERVIDOR, MUTACAO POR SERVER ACTION. A pagina busca tudo de uma vez com
// Promise.all em vez de encadear -- tres chamadas em serie atrasariam a tela inteira por
// causa da mais lenta.

import type { Metadata } from 'next';

import Alert from '@mui/material/Alert';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import InviteCard from '@/components/household/InviteCard';
import MemberCard from '@/components/household/MemberCard';
import PageHeader from '@/components/ui/PageHeader';
import { isApiError } from '@/lib/domain/api';
import { plural } from '@/lib/domain/format';
import { ROLE_HINTS, ROLE_LABELS } from '@/lib/domain/labels';
import { canInvite, canManageMembers, canRotateInvite, isOnlyOwner } from '@/lib/domain/rules';
import { getHousehold, requireContext, serverApi } from '@/lib/session/server';

export const metadata: Metadata = { title: 'Casa' };

export default async function HouseholdPage() {
  const { session, membership, householdId } = await requireContext();
  const api = await serverApi();

  try {
    const [casa, membros] = await Promise.all([
      getHousehold(householdId),
      api.households.listMembers(householdId),
    ]);

    // O convite exige owner ou adult na API -- pedir para um child daria 403 e derrubaria
    // a tela inteira por causa de um cartao.
    const convite = canInvite(membership)
      ? await api.households.getInvite(householdId)
      : null;

    const gerencia = canManageMembers(membership);
    const ultimoOwner = isOnlyOwner(membros, session.user.id);

    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <PageHeader
          title="Casa"
          subtitle={casa.name + ' · ' + plural(membros.length, 'morador', 'moradores')}
        />

        {convite && (
          <InviteCard
            code={convite.code}
            expiresAt={convite.expiresAt}
            timeZone={casa.timezone}
            canRotate={canRotateInvite(membership)}
          />
        )}

        <Typography variant="h6" component="h2" gutterBottom>
          Moradores
        </Typography>

        <Stack spacing={2}>
          {membros.map((membro) => (
            <MemberCard
              key={membro.id}
              member={membro}
              timeZone={casa.timezone}
              isSelf={membro.user.id === session.user.id}
              canManage={gerencia}
              onlyOwner={membro.user.id === session.user.id && ultimoOwner}
            />
          ))}
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
          {(['owner', 'adult', 'child'] as const)
            .map((papel) => ROLE_LABELS[papel] + ': ' + ROLE_HINTS[papel])
            .join(' ')}
        </Typography>
      </Container>
    );
  } catch (causa) {
    if (isApiError(causa) && causa.code === 'NOT_HOUSEHOLD_MEMBER') {
      return (
        <Container maxWidth="sm" sx={{ py: 8 }}>
          <Alert severity="warning">
            Você não tem mais acesso a esta casa. Escolha outra ou peça um convite novo.
          </Alert>
        </Container>
      );
    }

    throw causa;
  }
}
