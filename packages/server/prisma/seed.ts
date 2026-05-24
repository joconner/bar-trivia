import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const game1Questions = [
  {
    id: 'seed-game-1-q1',
    prompt: 'What is the capital of Australia?',
    data: { choices: ['Sydney', 'Canberra', 'Melbourne', 'Brisbane'], correctIndex: 1 },
    position: 1,
  },
  {
    id: 'seed-game-1-q2',
    prompt: 'How many sides does a hexagon have?',
    data: { choices: ['5', '6', '7', '8'], correctIndex: 1 },
    position: 2,
  },
  {
    id: 'seed-game-1-q3',
    prompt: 'Who painted the Mona Lisa?',
    data: { choices: ['Michelangelo', 'Raphael', 'Leonardo da Vinci', 'Botticelli'], correctIndex: 2 },
    position: 3,
  },
  {
    id: 'seed-game-1-q4',
    prompt: 'What is the largest ocean on Earth?',
    data: { choices: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correctIndex: 3 },
    position: 4,
  },
  {
    id: 'seed-game-1-q5',
    prompt: 'In what year did World War II end?',
    data: { choices: ['1943', '1944', '1945', '1946'], correctIndex: 2 },
    position: 5,
  },
  {
    id: 'seed-game-1-q6',
    prompt: 'What is the currency of Japan?',
    data: { choices: ['Yuan', 'Won', 'Yen', 'Ringgit'], correctIndex: 2 },
    position: 6,
  },
  {
    id: 'seed-game-1-q7',
    prompt: 'Who wrote "Romeo and Juliet"?',
    data: { choices: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Geoffrey Chaucer'], correctIndex: 1 },
    position: 7,
  },
  {
    id: 'seed-game-1-q8',
    prompt: 'What is the tallest mountain in the world?',
    data: { choices: ['K2', 'Kangchenjunga', 'Mount Everest', 'Lhotse'], correctIndex: 2 },
    position: 8,
  },
  {
    id: 'seed-game-1-q9',
    prompt: 'How many strings does a standard guitar have?',
    data: { choices: ['4', '5', '6', '7'], correctIndex: 2 },
    position: 9,
  },
  {
    id: 'seed-game-1-q10',
    prompt: 'In which country is the Eiffel Tower located?',
    data: { choices: ['Italy', 'Belgium', 'France', 'Spain'], correctIndex: 2 },
    position: 10,
  },
  {
    id: 'seed-game-1-q11',
    prompt: 'What is the fastest land animal?',
    data: { choices: ['Lion', 'Cheetah', 'Greyhound', 'Pronghorn'], correctIndex: 1 },
    position: 11,
  },
  {
    id: 'seed-game-1-q12',
    prompt: 'Which planet is the largest in our solar system?',
    data: { choices: ['Saturn', 'Uranus', 'Neptune', 'Jupiter'], correctIndex: 3 },
    position: 12,
  },
  {
    id: 'seed-game-1-q13',
    prompt: 'How many continents are there on Earth?',
    data: { choices: ['5', '6', '7', '8'], correctIndex: 2 },
    position: 13,
  },
  {
    id: 'seed-game-1-q14',
    prompt: 'Which language has the most native speakers worldwide?',
    data: { choices: ['English', 'Spanish', 'Mandarin Chinese', 'Hindi'], correctIndex: 2 },
    position: 14,
  },
  {
    id: 'seed-game-1-q15',
    prompt: 'Who was the first President of the United States?',
    data: { choices: ['John Adams', 'Benjamin Franklin', 'George Washington', 'Thomas Jefferson'], correctIndex: 2 },
    position: 15,
  },
  {
    id: 'seed-game-1-q16',
    prompt: 'What is the longest river in the world?',
    data: { choices: ['Amazon', 'Mississippi', 'Yangtze', 'Nile'], correctIndex: 3 },
    position: 16,
  },
  {
    id: 'seed-game-1-q17',
    prompt: 'How many players from one team are on a basketball court at a time?',
    data: { choices: ['4', '5', '6', '7'], correctIndex: 1 },
    position: 17,
  },
  {
    id: 'seed-game-1-q18',
    prompt: 'What is the smallest country in the world by area?',
    data: { choices: ['Monaco', 'San Marino', 'Liechtenstein', 'Vatican City'], correctIndex: 3 },
    position: 18,
  },
  {
    id: 'seed-game-1-q19',
    prompt: 'In what year did the Titanic sink?',
    data: { choices: ['1910', '1911', '1912', '1913'], correctIndex: 2 },
    position: 19,
  },
  {
    id: 'seed-game-1-q20',
    prompt: 'What sport is played at Wimbledon?',
    data: { choices: ['Golf', 'Cricket', 'Tennis', 'Polo'], correctIndex: 2 },
    position: 20,
  },
];

const game2Questions = [
  {
    id: 'seed-game-2-q1',
    prompt: 'What is the chemical symbol for gold?',
    data: { choices: ['Ag', 'Au', 'Go', 'Gd'], correctIndex: 1 },
    position: 1,
  },
  {
    id: 'seed-game-2-q2',
    prompt: 'How many bones are in the adult human body?',
    data: { choices: ['196', '206', '216', '226'], correctIndex: 1 },
    position: 2,
  },
  {
    id: 'seed-game-2-q3',
    prompt: 'What planet is known as the Red Planet?',
    data: { choices: ['Venus', 'Jupiter', 'Mars', 'Saturn'], correctIndex: 2 },
    position: 3,
  },
  {
    id: 'seed-game-2-q4',
    prompt: 'What organelle is known as the powerhouse of the cell?',
    data: { choices: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi body'], correctIndex: 2 },
    position: 4,
  },
  {
    id: 'seed-game-2-q5',
    prompt: 'What is the most abundant gas in Earth\'s atmosphere?',
    data: { choices: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Argon'], correctIndex: 2 },
    position: 5,
  },
  {
    id: 'seed-game-2-q6',
    prompt: 'Approximately how fast does light travel in a vacuum?',
    data: { choices: ['100,000 km/s', '200,000 km/s', '300,000 km/s', '400,000 km/s'], correctIndex: 2 },
    position: 6,
  },
  {
    id: 'seed-game-2-q7',
    prompt: 'How many chromosomes does a typical human cell have?',
    data: { choices: ['23', '46', '48', '56'], correctIndex: 1 },
    position: 7,
  },
  {
    id: 'seed-game-2-q8',
    prompt: 'What is the chemical formula for water?',
    data: { choices: ['H2O2', 'HO', 'H2O', 'H3O'], correctIndex: 2 },
    position: 8,
  },
  {
    id: 'seed-game-2-q9',
    prompt: 'What type of animal is a Komodo dragon?',
    data: { choices: ['Lizard', 'Snake', 'Turtle', 'Crocodile'], correctIndex: 0 },
    position: 9,
  },
  {
    id: 'seed-game-2-q10',
    prompt: 'What is the hardest natural substance on Earth?',
    data: { choices: ['Quartz', 'Corundum', 'Diamond', 'Topaz'], correctIndex: 2 },
    position: 10,
  },
  {
    id: 'seed-game-2-q11',
    prompt: 'How many teeth does a typical adult human have (including wisdom teeth)?',
    data: { choices: ['28', '30', '32', '34'], correctIndex: 2 },
    position: 11,
  },
  {
    id: 'seed-game-2-q12',
    prompt: 'What is the nearest star to Earth (other than the Sun)?',
    data: { choices: ["Barnard's Star", 'Sirius', 'Proxima Centauri', 'Alpha Centauri A'], correctIndex: 2 },
    position: 12,
  },
  {
    id: 'seed-game-2-q13',
    prompt: 'What is the atomic number of carbon?',
    data: { choices: ['4', '6', '8', '12'], correctIndex: 1 },
    position: 13,
  },
  {
    id: 'seed-game-2-q14',
    prompt: 'Which organ produces insulin?',
    data: { choices: ['Liver', 'Kidney', 'Pancreas', 'Spleen'], correctIndex: 2 },
    position: 14,
  },
  {
    id: 'seed-game-2-q15',
    prompt: 'What is the largest mammal on Earth?',
    data: { choices: ['African Elephant', 'Blue Whale', 'Sperm Whale', 'Giraffe'], correctIndex: 1 },
    position: 15,
  },
  {
    id: 'seed-game-2-q16',
    prompt: 'What is the boiling point of water at sea level in Celsius?',
    data: { choices: ['90°C', '95°C', '100°C', '105°C'], correctIndex: 2 },
    position: 16,
  },
  {
    id: 'seed-game-2-q17',
    prompt: 'How many legs does an insect have?',
    data: { choices: ['4', '6', '8', '10'], correctIndex: 1 },
    position: 17,
  },
  {
    id: 'seed-game-2-q18',
    prompt: 'What is the scientific study of earthquakes called?',
    data: { choices: ['Geology', 'Volcanology', 'Seismology', 'Tectonics'], correctIndex: 2 },
    position: 18,
  },
  {
    id: 'seed-game-2-q19',
    prompt: 'What gas do plants absorb from the atmosphere during photosynthesis?',
    data: { choices: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], correctIndex: 2 },
    position: 19,
  },
  {
    id: 'seed-game-2-q20',
    prompt: 'What is the most common blood type in humans?',
    data: { choices: ['A', 'B', 'AB', 'O'], correctIndex: 3 },
    position: 20,
  },
];

async function main() {
  const user = await prisma.user.upsert({
    where: { id: 'seed-host-user' },
    update: {},
    create: {
      id: 'seed-host-user',
      role: 'host',
      displayName: 'Trivia Host',
      email: 'host@trivia.local',
    },
  });

  const pack = await prisma.pack.upsert({
    where: { id: 'seed-pack-1' },
    update: {},
    create: {
      id: 'seed-pack-1',
      title: 'Bar Trivia Night',
      ownerId: user.id,
    },
  });

  const game1 = await prisma.game.upsert({
    where: { id: 'seed-game-1' },
    update: {},
    create: {
      id: 'seed-game-1',
      packId: pack.id,
      title: 'General Knowledge',
      position: 1,
    },
  });

  const game2 = await prisma.game.upsert({
    where: { id: 'seed-game-2' },
    update: {},
    create: {
      id: 'seed-game-2',
      packId: pack.id,
      title: 'Science & Nature',
      position: 2,
    },
  });

  for (const q of game1Questions) {
    await prisma.question.upsert({
      where: { id: q.id },
      update: {},
      create: { ...q, gameId: game1.id },
    });
  }

  for (const q of game2Questions) {
    await prisma.question.upsert({
      where: { id: q.id },
      update: {},
      create: { ...q, gameId: game2.id },
    });
  }

  console.log('Seed complete: 2 games, 40 questions.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
