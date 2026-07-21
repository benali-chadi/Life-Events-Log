import type { LELEvent } from '../components/EventCard';

export type { LELEvent } from '../components/EventCard';

type EventSection = {
  title: string;
  data: LELEvent[];
};

export const eventSections: EventSection[] = [
  {
    title: 'Today',
    data: [
      {
        title: 'Started implementing event filters',
        date: '18:40',
        categoryName: 'Life Events Log',
        categoryColor: 'blue',
        tags: ['development', 'filters', 'ui'],
        location: 'Rabat',
        significance: 'notable',
      },
      {
        title: 'Coffee with Mounir',
        date: '16:15',
        categoryName: 'Social',
        categoryColor: 'amber',
        people: ['Mounir'],
        location: 'Agdal, Rabat',
      },
      {
        title: 'Finished the event card prototype',
        date: '11:30',
        categoryName: 'Design',
        categoryColor: 'rose',
        tags: ['design-system', 'event-card'],
        significance: 'major',
        notes:
          'The interaction and visual hierarchy finally started feeling coherent.',
      },
    ],
  },
  {
    title: 'Yesterday',
    data: [
      {
        title: 'Dinner with the family',
        date: '20:30',
        categoryName: 'Family',
        categoryColor: 'green',
        people: ['Mom', 'Grandmother'],
        location: 'Salé',
      },
      {
        title: 'Read a chapter from Designing Data-Intensive Applications',
        date: '15:10',
        categoryName: 'Learning',
        categoryColor: 'amber',
        tags: ['books', 'databases', 'distributed-systems'],
      },
      {
        title: 'Evening walk',
        date: '19:05',
        location: 'Marina Bouregreg',
      },
    ],
  },
  {
    title: '2026-07-14',
    data: [
      {
        title: 'Watched Morocco vs Spain',
        date: '21:00',
        categoryName: 'Football',
        categoryColor: 'violet',
        tags: ['match', 'morocco'],
        people: ['Issam', 'Bilal', 'Mounir'],
        location: 'Stade Moulay Abdellah',
      },
      {
        title: 'Bought tickets for the game',
        date: '10:45',
        categoryName: 'Football',
        categoryColor: 'violet',
        tags: ['tickets'],
      },
    ],
  },
  {
    title: '2026-07-10',
    data: [
      {
        title: 'First working version of the searchable multi-select dropdown',
        date: '17:25',
        categoryName: 'Life Events Log',
        categoryColor: 'blue',
        tags: [
          'react-native',
          'dropdown',
          'search',
          'multi-select',
          'component',
        ],
        people: ['Yassine'],
      },
      {
        title: 'Lunch',
        date: '13:20',
        location: 'Casablanca',
      },
    ],
  },
  {
    title: '2026-06-28',
    data: [
      {
        title: 'Weekend trip to Chefchaouen',
        date: '09:00',
        categoryName: 'Travel',
        categoryColor: 'teal',
        tags: ['road-trip', 'photography', 'weekend'],
        people: ['Karim', 'Youssef'],
        location: 'Chefchaouen',
      },
      {
        title: 'Walked through the old medina',
        date: '16:40',
        categoryName: 'Travel',
        categoryColor: 'teal',
        tags: ['medina', 'photography'],
        people: ['Karim', 'Youssef'],
        location: 'Chefchaouen Medina',
      },
    ],
  },
  {
    title: '2026-06-15',
    data: [
      {
        title: 'Published a new LinkShelf demo video',
        date: '14:35',
        categoryName: 'LinkShelf',
        categoryColor: 'magenta',
        tags: ['launch', 'demo', 'marketing'],
      },
      {
        title:
          'Shaviolet LinkShelf on Reddit and received the first detailed feedback',
        date: '18:50',
        categoryName: 'LinkShelf',
        categoryColor: 'magenta',
        tags: ['violetdit', 'feedback', 'marketing', 'community'],
        people: ['violetdit user'],
      },
    ],
  },
  {
    title: '2026-05-23',
    data: [
      {
        title: 'Attended my first local developer meetup',
        date: '18:30',
        categoryName: 'Career',
        categoryColor: 'navy',
        tags: ['meetup', 'software-development', 'networking'],
        people: ['Sara', 'Omar', 'Mehdi', 'Anas'],
        location: 'Technopark Casablanca',
        significance: 'major',
      },
    ],
  },
  {
    title: '2026-03-08',
    data: [
      {
        title:
          'Spent the afternoon reorganizing all my notes, saved links, bookmarks and unfinished reading lists into a structure that finally makes sense',
        date: '14:00',
        categoryName: 'Personal Projects',
        categoryColor: 'blue',
        tags: [
          'organization',
          'knowledge-management',
          'bookmarks',
          'notes',
          'cleanup',
        ],
        location: 'Home',
      },
      {
        title: 'Came up with the initial idea for Life Events Log',
        date: '21:15',
        categoryName: 'Personal Projects',
        categoryColor: 'blue',
        tags: ['idea', 'local-first', 'timeline'],
        significance: 'turning-point',
        notes:
          'This was the moment the idea became something I wanted to build.',
      },
    ],
  },
  {
    title: '2025-11-17',
    data: [
      {
        title: 'Started learning Rust',
        date: '19:30',
        categoryName: 'Learning',
        categoryColor: 'coral',
        tags: ['rust', 'programming'],
      },
      {
        title: 'Created the first version of the Rulox interpreter',
        date: '23:10',
        categoryName: 'Projects',
        categoryColor: 'blue',
        tags: ['rust', 'interpreter', 'lox'],
      },
    ],
  },
  {
    title: '2025-08-04',
    data: [
      {
        title: 'Moved to a new apartment',
        date: '10:00',
        categoryName: 'Personal',
        categoryColor: 'green',
        people: ['Mom', 'Bilal'],
        location: 'Rabat',
        significance: 'turning-point',
      },
    ],
  },
  {
    title: '2024-07-19',
    data: [
      {
        title: 'Graduation day',
        date: '11:00',
        categoryName: 'Education',
        categoryColor: 'amber',
        people: ['Mom', 'Dad', 'Friends'],
        location: 'Casablanca',
        significance: 'turning-point',
      },
    ],
  },
];
