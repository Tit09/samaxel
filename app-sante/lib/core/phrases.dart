/// Phrases du guide vocal (clé → français / anglais).
///
/// Ce catalogue sert de SOURCE pour enregistrer les voix dans les langues nationales :
/// chaque phrase est traduite et validée par un locuteur natif, puis générée par
/// synthèse vocale et déposée dans `assets/voix/<langue>/<clé>.mp3`
/// (voir tools/generer_voix.py).
class Phrase {
  const Phrase(this.fr, this.en);
  final String fr;
  final String en;
}

const phrases = <String, Phrase>{
  'bienvenue': Phrase(
    'Bienvenue sur SAMA XHEL. Nous allons vous aider à prendre soin de votre enfant. Choisissez votre langue.',
    'Welcome to SAMA XHEL. We will help you take care of your child. Choose your language.'),
  'connexion': Phrase(
    'Écrivez votre numéro de téléphone et votre mot de passe, puis appuyez sur le bouton vert.',
    'Enter your phone number and password, then press the green button.'),
  'inscription': Phrase(
    'Créez votre compte. Il faut votre nom, votre numéro de téléphone et un mot de passe. Vos informations restent secrètes.',
    'Create your account. We need your name, phone number and a password. Your information stays private.'),
  'code': Phrase(
    'Vous avez reçu un code à six chiffres par message. Écrivez-le ici.',
    'You received a six-digit code by message. Type it here.'),
  'accueil_parent': Phrase(
    'Ceci est votre accueil. Appuyez sur Faire un test pour observer votre enfant, ou sur Trouver de l’aide pour voir les centres près de chez vous.',
    'This is your home page. Press Take a test to observe your child, or Find help to see centres near you.'),
  'enfants': Phrase(
    'Voici vos enfants. Appuyez sur Ajouter un enfant pour enregistrer un enfant.',
    'Here are your children. Press Add a child to register a child.'),
  'ajout_enfant': Phrase(
    'Écrivez le prénom, le nom et la date de naissance de votre enfant.',
    'Enter your child’s first name, last name and date of birth.'),
  'choix_test': Phrase(
    'Choisissez le test qui correspond à ce qui vous inquiète. Ce n’est pas un diagnostic : le test vous aide à savoir s’il faut voir un spécialiste.',
    'Choose the test that matches your concern. It is not a diagnosis: it helps you know whether to see a specialist.'),
  'question': Phrase(
    'Écoutez la question, puis appuyez sur la réponse qui ressemble le plus à votre enfant.',
    'Listen to the question, then press the answer that best describes your child.'),
  'resultat_faible': Phrase(
    'Le test ne montre pas de signe inquiétant aujourd’hui. Continuez à observer votre enfant.',
    'The test shows no worrying signs today. Keep observing your child.'),
  'resultat_modere': Phrase(
    'Le test montre quelques signes. Nous vous conseillons de voir un professionnel. Voici des structures près de chez vous.',
    'The test shows some signs. We advise you to see a professional. Here are facilities near you.'),
  'resultat_eleve': Phrase(
    'Le test montre plusieurs signes importants. Prenez rendez-vous rapidement avec une structure. Ce n’est pas un diagnostic.',
    'The test shows several important signs. Book an appointment quickly. This is not a diagnosis.'),
  'alerte': Phrase(
    'Attention : une de vos réponses demande un avis médical rapide. En cas de danger, appelez le SAMU au 1515.',
    'Warning: one of your answers needs quick medical advice. In an emergency, call SAMU on 1515.'),
  'annuaire': Phrase(
    'Voici les hôpitaux, centres et écoles qui peuvent aider votre enfant. Les plus proches sont en haut.',
    'Here are the hospitals, centres and schools that can help your child. The closest are at the top.'),
  'structure': Phrase(
    'Vous pouvez appeler cette structure, voir le chemin, ou demander une prise en charge pour votre enfant.',
    'You can call this facility, get directions, or request care for your child.'),
  'rdv': Phrase(
    'Voici vos rendez-vous. Le jour de la consultation vidéo, appuyez sur Rejoindre.',
    'Here are your appointments. On the day of a video consultation, press Join.'),
  'messages': Phrase(
    'Écrivez au médecin de votre enfant. Vos messages sont secrets : personne d’autre ne peut les lire.',
    'Write to your child’s doctor. Your messages are private: nobody else can read them.'),
  'humeur': Phrase(
    'Comment vous sentez-vous aujourd’hui ? Appuyez sur un visage. Vous pouvez aussi écrire ce que vous ressentez.',
    'How do you feel today? Press a face. You can also write how you feel.'),
  'crise': Phrase(
    'Vous n’êtes pas seul. Parlez dès maintenant à une personne de confiance. En cas de danger, appelez le SAMU au 1515.',
    'You are not alone. Talk to someone you trust right now. In an emergency, call SAMU on 1515.'),
  'profil': Phrase(
    'Ici, vous pouvez changer votre langue, voir vos autorisations et vous déconnecter.',
    'Here you can change your language, see your permissions and log out.'),
  'assistant': Phrase(
    'Appuyez sur le micro et parlez dans votre langue, comme sur WhatsApp. Appuyez encore pour envoyer. Je vous réponds.',
    'Press the microphone and speak in your language, like on WhatsApp. Press again to send. I will answer you.'),
  'assistant_salut': Phrase(
    'Bonjour, je suis l’assistant de SAMA XHEL. Dites-moi ce dont votre enfant a besoin.',
    'Hello, I am the SAMA XHEL assistant. Tell me what your child needs.'),
  'assistant_structure': Phrase(
    'Voici les centres qui peuvent aider votre enfant, les plus proches en premier. Appuyez sur le bouton vert pour appeler.',
    'Here are the centres that can help your child, the closest first. Press the green button to call.'),
  'assistant_rdv': Phrase(
    'Voici vos rendez-vous. Appuyez sur le bouton plus pour en demander un.',
    'Here are your appointments. Press the plus button to request one.'),
  'assistant_test': Phrase(
    'Je vous propose un petit test : j’écoute avec vous les questions et vous appuyez sur la réponse. Ce n’est pas un diagnostic.',
    'Let us do a short test: listen to the questions and press the answer. It is not a diagnosis.'),
  'assistant_transmis': Phrase(
    'J’ai bien reçu votre message. Je l’ai transmis à l’équipe qui suit votre enfant. Elle vous répondra.',
    'I received your message and sent it to the team caring for your child. They will answer you.'),
  'assistant_repeter': Phrase(
    'Je n’ai pas bien compris. Pouvez-vous répéter, plus près du téléphone ?',
    'I did not understand well. Can you repeat, closer to the phone?'),
  'assistant_urgence': Phrase(
    'Si votre enfant est en danger maintenant, appelez le SAMU au 1515. J’ai aussi prévenu votre équipe soignante.',
    'If your child is in danger now, call SAMU on 1515. I have also alerted your care team.'),
  'assistant_aide': Phrase(
    'Appuyez sur le haut-parleur de chaque page pour l’entendre dans votre langue. Vous pouvez aussi rejoindre le groupe des parents.',
    'Press the speaker on each page to hear it in your language. You can also join the parents group.'),
  'pour_qui': Phrase(
    'Pour qui cherchez-vous de l’aide ? Pour vous, pour votre enfant, ou pour un proche ?',
    'Who are you looking for help for? Yourself, your child, or a relative?'),
  'portail': Phrase(
    'Vous êtes dans l’espace de cet hôpital. Ici vous voyez votre dossier, votre soignant, vos rendez-vous et vos tickets.',
    'You are in this hospital’s space. Here you see your file, your carer, your appointments and your tickets.'),
  'mes_hopitaux': Phrase(
    'Voici les hôpitaux que vous avez rejoints. Appuyez sur un hôpital pour entrer chez lui.',
    'Here are the hospitals you have joined. Press a hospital to enter it.'),
  'ticket': Phrase(
    'Voici votre ticket. Montrez-le à la caisse de l’entrée. Ensuite, allez au bureau indiqué et attendez qu’on appelle votre numéro.',
    'Here is your ticket. Show it at the entrance cash desk. Then go to the office shown and wait for your number to be called.'),
  'etablissements': Phrase(
    'Voici les hôpitaux et centres de santé mentale. Touchez un hôpital pour le voir et le rejoindre.',
    'Here are the mental health hospitals and centres. Tap a hospital to see and join it.'),
  'portail_presentation': Phrase(
    'Voici la page de cet hôpital. Pour y être suivi, touchez le bouton Rejoindre.',
    'This is the hospital page. To be followed here, tap Join.'),
  'rejoindre': Phrase(
    'Pour qui demandez-vous un suivi ? Touchez la personne, puis Envoyer la demande.',
    'Who are you asking care for? Tap the person, then Send the request.'),
  'demande_attente': Phrase(
    'Votre demande est envoyée. L’accueil de l’hôpital va l’accepter. Ensuite, votre soignant s’affichera ici.',
    'Your request has been sent. The hospital will accept it, then your carer will appear here.'),
  'soignant': Phrase(
    'Voici votre soignant. Touchez Rendez-vous pour le voir, ou Écrire pour lui envoyer un message secret.',
    'This is your carer. Tap Appointment to see them, or Write to send a private message.'),
  'payer_ticket': Phrase(
    'Pour payer votre ticket, choisissez Wave ou Orange Money, payez, puis écrivez la référence du message reçu.',
    'To pay your ticket, choose Wave or Orange Money, pay, then type the reference of the message you received.'),
  'rdv_demande': Phrase(
    'Choisissez pour qui, puis sur place ou en vidéo, et touchez Envoyer la demande.',
    'Choose who, then in person or by video, and tap Send the request.'),
  'communaute': Phrase(
    'Ceci est le groupe des familles. Tout le monde peut lire ces messages : ne donnez pas de détail sur votre santé ici.',
    'This is the families group. Everyone can read these messages: do not share health details here.'),
  'ordonnances': Phrase(
    'Voici les ordonnances de votre médecin et les pharmacies proches de chez vous.',
    'Here are your prescriptions and the pharmacies near you.'),
  'chat': Phrase(
    'Écrivez ou enregistrez un message vocal pour votre soignant. Lui seul peut le lire.',
    'Write or record a voice message for your carer. Only they can read it.'),
  'visio': Phrase(
    'Consultation vidéo. Restez devant la caméra. Le bouton rouge termine l’appel.',
    'Video consultation. Stay in front of the camera. The red button ends the call.'),
  'notifications': Phrase(
    'Voici vos messages de SAMA XHEL : rendez-vous, réponses de l’hôpital, tickets.',
    'Here are your SAMA XHEL messages: appointments, hospital answers, tickets.'),
  'mot_de_passe': Phrase(
    'Vous avez oublié votre mot de passe ? Écrivez votre numéro : vous recevrez un code pour en choisir un nouveau.',
    'Forgot your password? Type your number: you will receive a code to choose a new one.'),
  'langue': Phrase(
    'Vous avez choisi cette langue. Toute l’application vous parlera dans cette langue.',
    'You have chosen this language. The whole app will speak to you in this language.'),
  'inscription_besoins': Phrase(
    'Dites-nous ce qui vous inquiète. Vous pouvez passer cette étape.',
    'Tell us what worries you. You can skip this step.'),
  'inscription_accord': Phrase(
    'Vos informations restent secrètes. Touchez les deux premières cases pour accepter, puis Créer mon compte.',
    'Your information stays private. Tap the first two boxes to accept, then Create my account.'),
};
