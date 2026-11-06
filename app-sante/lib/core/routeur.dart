import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../ecrans/auth/code_ecran.dart';
import '../ecrans/auth/connexion_ecran.dart';
import '../ecrans/auth/inscription_ecran.dart';
import '../ecrans/auth/mot_de_passe_ecran.dart';
import '../ecrans/bienvenue_ecran.dart';
import '../ecrans/commun/canaux_ecran.dart';
import '../ecrans/commun/chat_ecran.dart';
import '../ecrans/commun/messages_ecran.dart';
import '../ecrans/commun/notifications_ecran.dart';
import '../ecrans/commun/profil_ecran.dart';
import '../ecrans/commun/visio_ecran.dart';
import '../ecrans/coquille.dart';
import '../ecrans/parent/accueil_parent.dart';
import '../ecrans/parent/annuaire_ecran.dart';
import '../ecrans/parent/assistant_ecran.dart';
import '../ecrans/parent/communaute_ecran.dart';
import '../ecrans/parent/ordonnances_ecran.dart';
import '../ecrans/parent/enfant_detail_ecran.dart';
import '../ecrans/parent/enfant_form_ecran.dart';
import '../ecrans/parent/enfants_ecran.dart';
import '../ecrans/parent/humeur_ecran.dart';
import '../ecrans/parent/questionnaire_ecran.dart';
import '../ecrans/parent/rdv_parent_ecran.dart';
import '../ecrans/parent/resultat_ecran.dart';
import '../ecrans/parent/structure_ecran.dart';
import '../ecrans/parent/tests_ecran.dart';
import '../ecrans/portails/creer_hopital_ecran.dart';
import '../ecrans/portails/etablissements_ecran.dart';
import '../ecrans/portails/portail_ecran.dart';
import '../ecrans/portails/pour_qui_ecran.dart';
import '../ecrans/pro/accueil_pro.dart';
import '../ecrans/pro/admin_ecran.dart';
import '../ecrans/pro/familles_ecran.dart';
import '../ecrans/pro/agenda_ecran.dart';
import '../ecrans/pro/consultation_form_ecran.dart';
import '../ecrans/parent/maison_ecran.dart';
import '../ecrans/pro/caisse_ecran.dart';
import '../ecrans/pro/dossier_ecran.dart';
import '../ecrans/pro/dossiers_ecran.dart';
import '../ecrans/pro/studio_voix_ecran.dart';
import '../ecrans/pro/super_admin_ecran.dart';
import 'modeles.dart';
import 'session.dart';

const _publiques = ['/bienvenue', '/connexion', '/inscription', '/code', '/mot-de-passe', '/trouver-public', '/structure-public'];
/// Pages ouvertes à tous, connectés ou non (pas de redirection vers l'accueil)
const _ouvertes = ['/pour-qui', '/etablissements', '/portail/', '/creer-hopital'];

final routeurProvider = Provider<GoRouter>((ref) {
  final rafraichir = ValueNotifier<int>(0);
  ref.listen(sessionProvider, (_, _) => rafraichir.value++);
  ref.onDispose(rafraichir.dispose);

  return GoRouter(
    initialLocation: '/bienvenue',
    refreshListenable: rafraichir,
    redirect: (context, etat) {
      final s = ref.read(sessionProvider);
      final chemin = etat.matchedLocation;
      if (s.verification) return chemin == '/demarrage' ? null : '/demarrage';
      if (_ouvertes.any((p) => chemin.startsWith(p))) return null;
      final public = _publiques.any((p) => chemin.startsWith(p));
      final u = s.user;
      if (u == null) return public ? null : '/bienvenue';
      final superAdmin = u.role == 'SUPER_ADMIN';
      final accueil = superAdmin ? '/super' : (u.estParent ? '/accueil' : '/pro/accueil');
      if (public || chemin == '/demarrage') return accueil;
      if (superAdmin) return (chemin == '/super' || chemin == '/communaute' || chemin == '/notifications' || chemin == '/studio-voix') ? null : '/super';
      if (chemin == '/super') return accueil;
      if (u.estParent && chemin.startsWith('/pro/')) return '/accueil';
      if (!u.estParent && _cheminsParent.any((p) => chemin.startsWith(p))) return '/pro/accueil';
      return null;
    },
    routes: [
      GoRoute(path: '/demarrage', builder: (_, _) => const _Demarrage()),
      GoRoute(path: '/bienvenue', builder: (_, _) => const BienvenueEcran()),
      GoRoute(path: '/connexion', builder: (_, e) => ConnexionEcran(portail: e.uri.queryParameters['portail'], espace: e.uri.queryParameters['espace'])),
      GoRoute(path: '/inscription', builder: (_, e) => InscriptionEcran(portail: e.uri.queryParameters['portail'])),
      GoRoute(path: '/mot-de-passe', builder: (_, _) => const MotDePasseEcran()),
      GoRoute(path: '/code', builder: (_, e) => CodeEcran(params: e.extra as ParamsCode)),
      GoRoute(path: '/trouver-public', builder: (_, _) => const AnnuaireEcran(public: true)),
      GoRoute(path: '/structure-public/:id', builder: (_, e) => StructureEcran(id: e.pathParameters['id']!)),
      GoRoute(path: '/pour-qui', builder: (_, e) => PourQuiEcran(pro: e.uri.queryParameters['pro'] == '1')),
      GoRoute(
        path: '/etablissements',
        builder: (_, e) => EtablissementsEcran(
          public: e.uri.queryParameters['public'],
          enLigne: e.uri.queryParameters['en_ligne'] == 'true' ? true : null,
        ),
      ),
      GoRoute(path: '/portail/:code', builder: (_, e) => PortailEcran(code: e.pathParameters['code']!)),
      GoRoute(path: '/creer-hopital', builder: (_, _) => const CreerHopitalEcran()),

      // ── Espace parent ───────────────────────────────────────────────────
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => Coquille(shell: shell, pro: false),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/accueil', builder: (_, _) => const AccueilParent())]),
          StatefulShellBranch(routes: [GoRoute(path: '/enfants', builder: (_, _) => const EnfantsEcran())]),
          StatefulShellBranch(routes: [GoRoute(path: '/trouver', builder: (_, _) => const AnnuaireEcran())]),
          StatefulShellBranch(routes: [GoRoute(path: '/messages', builder: (_, _) => const MessagesEcran())]),
          StatefulShellBranch(routes: [GoRoute(path: '/profil', builder: (_, _) => const ProfilEcran())]),
        ],
      ),
      GoRoute(path: '/enfant/ajouter', builder: (_, _) => const EnfantFormEcran()),
      GoRoute(path: '/enfant/:id', builder: (_, e) => EnfantDetailEcran(id: e.pathParameters['id']!)),
      GoRoute(path: '/tests', builder: (_, e) => TestsEcran(enfantId: e.uri.queryParameters['enfant'])),
      GoRoute(
        path: '/test/:code',
        builder: (_, e) => QuestionnaireEcran(code: e.pathParameters['code']!, enfantId: e.uri.queryParameters['enfant']),
      ),
      GoRoute(path: '/resultat', builder: (_, e) => ResultatEcran(donnees: e.extra as Map<String, dynamic>)),
      GoRoute(path: '/structure/:id', builder: (_, e) => StructureEcran(id: e.pathParameters['id']!)),
      GoRoute(path: '/rendez-vous', builder: (_, _) => const RdvParentEcran()),
      GoRoute(path: '/humeur', builder: (_, _) => const HumeurEcran()),
      GoRoute(path: '/assistant', builder: (_, _) => const AssistantEcran()),
      GoRoute(path: '/ordonnances', builder: (_, _) => const OrdonnancesEcran()),
      GoRoute(path: '/communaute', builder: (_, _) => const CommunauteEcran()),
      GoRoute(path: '/mes-hopitaux', builder: (_, _) => const MesHopitauxEcran()),
      GoRoute(path: '/maison/:code', builder: (_, e) => MaisonEcran(code: e.pathParameters['code']!)),
      GoRoute(path: '/super', builder: (_, _) => const SuperAdminEcran()),
      GoRoute(path: '/studio-voix', builder: (_, _) => const StudioVoixEcran()),

      // ── Commun ──────────────────────────────────────────────────────────
      GoRoute(path: '/notifications', builder: (_, _) => const NotificationsEcran()),
      GoRoute(path: '/reglages/notifications', builder: (_, _) => const CanauxEcran()),
      GoRoute(path: '/chat/:id', builder: (_, e) => ChatEcran(conversation: e.extra as Conversation)),
      GoRoute(path: '/visio/:id', builder: (_, e) => VisioEcran(consultationId: e.pathParameters['id']!)),
      GoRoute(
        path: '/appel/:id',
        builder: (_, e) => VisioEcran(
          appelId: e.pathParameters['id']!,
          mode: e.uri.queryParameters['mode'] == 'AUDIO' ? 'AUDIO' : 'VIDEO',
          appelant: e.uri.queryParameters['appelant'] == '1',
          nom: e.uri.queryParameters['nom'],
        ),
      ),

      // ── Espace professionnel ────────────────────────────────────────────
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => Coquille(shell: shell, pro: true),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/pro/accueil', builder: (_, _) => const AccueilPro())]),
          StatefulShellBranch(routes: [GoRoute(path: '/pro/dossiers', builder: (_, _) => const DossiersEcran())]),
          StatefulShellBranch(routes: [GoRoute(path: '/pro/agenda', builder: (_, _) => const AgendaEcran())]),
          StatefulShellBranch(routes: [GoRoute(path: '/pro/messages', builder: (_, _) => const MessagesEcran())]),
          StatefulShellBranch(routes: [GoRoute(path: '/pro/profil', builder: (_, _) => const ProfilEcran())]),
        ],
      ),
      GoRoute(path: '/pro/dossier/:id', builder: (_, e) => DossierEcran(id: e.pathParameters['id']!)),
      GoRoute(path: '/pro/consultation', builder: (_, e) => ConsultationFormEcran(params: e.extra as ParamsConsultation)),
      GoRoute(path: '/pro/admin', builder: (_, _) => const AdminEcran()),
      GoRoute(path: '/pro/familles', builder: (_, _) => const FamillesEcran()),
      GoRoute(path: '/pro/caisse', builder: (_, _) => const CaisseEcran()),
      GoRoute(path: '/pro/file', builder: (_, _) => const FileAttenteEcran()),
    ],
  );
});

const _cheminsParent = ['/maison/', '/mes-hopitaux', '/accueil', '/enfants', '/enfant/', '/trouver', '/messages', '/profil', '/tests', '/test/', '/resultat', '/structure/', '/rendez-vous', '/humeur', '/assistant', '/communaute', '/ordonnances'];

class _Demarrage extends StatelessWidget {
  const _Demarrage();
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Image.asset('assets/images/logo.png', width: 150),
            const SizedBox(height: 24),
            const CircularProgressIndicator(),
          ]),
        ),
      );
}
