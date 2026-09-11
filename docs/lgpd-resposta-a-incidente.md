# Plano de resposta a incidente (LGPD art. 48)

> Rascunho de processo — **validar com jurídico antes do lançamento público**. Cobre a obrigação de notificar ANPD e titulares em caso de incidente de segurança com dado pessoal (LGPD art. 48). Não bloqueia engenharia do MVP (ver `PLANNING.md` §8); documento fica pendente até `admin` (Jonatas) ou jurídico externo preencher os `TBD`.

## Escopo

Aplica a qualquer incidente que exponha, altere ou destrua sem autorização dado pessoal tratado pela plataforma — dado de cliente do tenant, parte contrária, ou usuário (advogado/secretário). Inclui vazamento de credencial, bypass de RLS entre tenants, exfiltração de banco, backup exposto, etc.

## Papéis

| Papel | Responsabilidade | Quem (TBD) |
|---|---|---|
| Encarregado (DPO) | Ponto de contato formal com ANPD e titulares; decide se incidente gera "risco ou dano relevante" (gatilho do art. 48) | `TBD` |
| Responsável técnico | Detecção, contenção, análise de escopo do incidente (quais tenants/tabelas/linhas) | `TBD` — hoje, `admin` técnico do projeto |
| Jurídico externo | Valida enquadramento legal, redige comunicado formal, acompanha prazo | `TBD` |

Enquanto o produto não tem equipe própria, `admin` técnico acumula os três papéis — mas comunicação formal a ANPD/titular não deve ser redigida sem revisão jurídica, ainda que informal.

## Fluxo

1. **Detecção** — via alerta de monitoramento, relato de tenant, ou auditoria (`audit_log`). Registrar timestamp de constatação (marca o início do prazo legal).
2. **Triagem (até 24h)** — responsável técnico avalia: quais tabelas/tenants afetados, se há dado sensível (LGPD art. 5º, II — inclui dado de matter penal/saúde, ver §8 do PLANNING.md), volume de titulares.
3. **Contenção** — revogar credencial exposta, corrigir policy de RLS, isolar recurso comprometido. Não apagar evidência (log, linha afetada) antes de documentar — necessário para o relatório à ANPD e para `audit_log`.
4. **Classificação de severidade**:
   - **Crítico**: dado sensível exposto, ou vazamento cross-tenant, ou volume grande de titulares.
   - **Alto**: dado pessoal comum exposto para terceiro não autorizado, escopo limitado a um tenant.
   - **Baixo**: incidente contido sem exposição confirmada a terceiro (ex.: bug que só teoricamente permitiria acesso, sem evidência de exploração).
   - Crítico e Alto disparam notificação (passo 5); Baixo fica registrado internamente com justificativa de não notificar.
5. **Notificação** — encarregado + jurídico decidem conteúdo e prazo à luz da regulamentação da ANPD vigente à época (a LGPD fala em "prazo razoável"; a ANPD publicou norma detalhando prazo e conteúdo mínimo da comunicação — **confirmar o texto em vigor com jurídico no momento do incidente**, não fixar aqui um número que pode ficar defasado). Notificar:
   - ANPD, pelo canal oficial vigente.
   - Titulares afetados (cliente do tenant e, quando aplicável, parte contrária) — ou, quando o titular é cliente de um tenant, avaliar se a comunicação ao titular final é responsabilidade do tenant (controlador) e a plataforma (operadora) apenas o notifica e o instrumenta.
6. **Remediação** — fix definitivo, não só contenção; registrar no ticket/ADR correspondente se a causa raiz for arquitetural.
7. **Registro** — entrada em `audit_log` (se aplicável) + relatório interno: linha do tempo, escopo, decisão de severidade, notificações enviadas, fix aplicado. Guardar independente do `audit_log` do banco (o incidente pode ser exatamente o que compromete o banco).
8. **Post-mortem** — dentro de 1 semana da resolução, sem viés de culpa: o que falhou, o que detectou, o que teria detectado mais rápido.

## Pendências (`TBD`)

- Nomear encarregado (DPO) formal antes do lançamento público.
- Confirmar canal oficial de notificação à ANPD e conteúdo mínimo exigido na regulamentação vigente no momento do lançamento (não travar no texto deste documento).
- Definir contrato/DPA com jurídico externo para acionamento em incidente (ver §8 do PLANNING.md — ponto já listado como pendência de contrato, não só engenharia).
- Decidir template de comunicado a titular (cliente do tenant vs. parte contrária) — redação jurídica, não técnica.
