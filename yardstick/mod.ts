// // Base class for all metrics
// abstract class Metric {
//   name: string;
//   help: string;
//   labels: string[];
//   data: Map<string, any>;

//   constructor(name: string, help: string, labels: string[] = []) {
//     this.name = name;
//     this.help = help;
//     this.labels = labels;
//     this.data = new Map();
//   }

//   abstract collect(): string;

//   getLabelString(labelValues: { [key: string]: string }): string {
//     return this.labels.map((label) => `${label}="${labelValues[label]}"`).join(
//       ',',
//     );
//   }
// }

// // Counter metric class
// class Counter extends Metric {
//   constructor(name: string, help: string, labels: string[] = []) {
//     super(name, help, labels);
//   }

//   inc(labelValues: { [key: string]: string } = {}, value: number = 1) {
//     const labelString = this.getLabelString(labelValues);
//     this.data.set(labelString, (this.data.get(labelString) || 0) + value);
//   }

//   collect(): string {
//     let result =
//       `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} counter\n`;
//     for (const [labels, value] of this.data.entries()) {
//       result += `${this.name}{${labels}} ${value}\n`;
//     }
//     return result;
//   }
// }

// // Gauge metric class
// class Gauge extends Metric {
//   constructor(name: string, help: string, labels: string[] = []) {
//     super(name, help, labels);
//   }

//   set(labelValues: { [key: string]: string } = {}, value: number) {
//     const labelString = this.getLabelString(labelValues);
//     this.data.set(labelString, value);
//   }

//   inc(labelValues: { [key: string]: string } = {}, value: number = 1) {
//     const labelString = this.getLabelString(labelValues);
//     this.data.set(labelString, (this.data.get(labelString) || 0) + value);
//   }

//   dec(labelValues: { [key: string]: string } = {}, value: number = 1) {
//     const labelString = this.getLabelString(labelValues);
//     this.data.set(labelString, (this.data.get(labelString) || 0) - value);
//   }

//   collect(): string {
//     let result =
//       `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} gauge\n`;
//     for (const [labels, value] of this.data.entries()) {
//       result += `${this.name}{${labels}} ${value}\n`;
//     }
//     return result;
//   }
// }

// // Histogram metric class
// class Histogram extends Metric {
//   buckets: number[];
//   counts: Map<string, number[]>;
//   sum: Map<string, number>;

//   constructor(
//     name: string,
//     help: string,
//     buckets: number[],
//     labels: string[] = [],
//   ) {
//     super(name, help, labels);
//     this.buckets = buckets;
//     this.counts = new Map();
//     this.sum = new Map();
//   }

//   observe(labelValues: { [key: string]: string } = {}, value: number) {
//     const labelString = this.getLabelString(labelValues);
//     if (!this.counts.has(labelString)) {
//       this.counts.set(labelString, new Array(this.buckets.length + 1).fill(0));
//       this.sum.set(labelString, 0);
//     }
//     const counts = this.counts.get(labelString)!;
//     this.sum.set(labelString, this.sum.get(labelString)! + value);

//     for (let i = 0; i < this.buckets.length; i++) {
//       if (value <= this.buckets[i]) {
//         counts[i]++;
//       }
//     }
//     counts[this.buckets.length]++;
//   }

//   collect(): string {
//     let result =
//       `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} histogram\n`;
//     for (const [labels, counts] of this.counts.entries()) {
//       const sum = this.sum.get(labels)!;
//       for (let i = 0; i < this.buckets.length; i++) {
//         result += `${this.name}_bucket{${labels},le="${this.buckets[i]}"}` +
//           ` ${counts[i]}\n`;
//       }
//       result += `${this.name}_bucket{${labels},le="+Inf"} ${
//         counts[this.buckets.length]
//       }\n`;
//       result += `${this.name}_sum{${labels}} ${sum}\n`;
//       result += `${this.name}_count{${labels}} ${
//         counts[this.buckets.length]
//       }\n`;
//     }
//     return result;
//   }
// }

// // Registry to hold all metrics
// class Registry {
//   metrics: Metric[] = [];

//   register(metric: Metric) {
//     this.metrics.push(metric);
//   }

//   collect(): string {
//     return this.metrics.map((metric) => metric.collect()).join('\n');
//   }
// }

// export { Counter, Gauge, Histogram, Registry };
