export const wordList = [
  "apple", "banana", "cat", "dog", "elephant", "fish", "guitar", "house", "ice cream", "jacket",
  "kite", "lion", "monkey", "nest", "orange", "penguin", "queen", "rabbit", "sun", "tree",
  "umbrella", "violin", "watermelon", "xylophone", "yacht", "zebra", "airplane", "boat", "car",
  "train", "bicycle", "motorcycle", "helicopter", "submarine", "rocket", "computer", "phone",
  "television", "radio", "camera", "book", "pencil", "pen", "paper", "scissors", "clock",
  "watch", "glasses", "hat", "shoes", "socks", "shirt", "pants", "dress", "skirt", "jacket",
  "coat", "gloves", "scarf", "ring", "necklace", "bracelet", "earrings", "pizza", "burger",
  "hotdog", "sandwich", "taco", "sushi", "pasta", "salad", "soup", "bread", "cheese", "egg",
  "milk", "water", "juice", "coffee", "tea", "cake", "cookie", "pie", "chocolate", "candy",
  "football", "basketball", "baseball", "soccer", "tennis", "golf", "volleyball", "swimming",
  "running", "jumping", "dancing", "singing", "painting", "drawing", "reading", "writing"
];

export function getRandomWords(count: number): string[] {
  const shuffled = [...wordList].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}
