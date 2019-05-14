library(ggplot2)
library(sitools)

#format_si <- function(...) {
#	# Based on code by Ben Tupper
#	# https://stat.ethz.ch/pipermail/r-help/2012-January/299804.html
#
#	function(x) {
#		limits <- c(1e-24, 1e-21, 1e-18, 1e-15, 1e-12,
#								1e-9,  1e-6,  1e-3,  1e0,   1e3,
#								1e6,   1e9,   1e12,  1e15,  1e18,
#								1e21,  1e24)
#		prefix <- c("y",   "z",   "a",   "f",   "p",
#								"n",   "µ",   "m",   " ",   "k",
#								"M",   "G",   "T",   "P",   "E",
#								"Z",   "Y")
#
#		# Vector with array indices according to position in intervals
#		i <- findInterval(abs(x), limits)
#
#		# Set prefix to " " for very small values < 1e-24
#		i <- ifelse(i==0, which(limits == 1e0), i)
#
#		paste(format(round(x/limits[i], 1),
#								 trim=TRUE, scientific=FALSE, ...),
#					prefix[i])
#	}
#}

data = data.frame()

for (i in 1:8) {
	data1 = read.csv(paste('data/p', i, '.csv', sep=''), header=FALSE, stringsAsFactors = FALSE, sep='\t')
	colnames(data1) = c('process', 'speed', 'something')
	data1['peers'] = i
	data1['Implementation'] = 'P2P (ours)'
	data = rbind(data, data1)
}

for (i in 1:8) {
	data1 = read.csv(paste('data/s', i, '.csv', sep=''), header=FALSE, stringsAsFactors = FALSE, sep='\t')
	colnames(data1) = c('process', 'speed', 'something')
	data1['peers'] = i
	data1['Implementation'] = 'Client-Server'
	data = rbind(data, data1)
}

#head(data[data$peers == 1,])

ggplot(data, aes(x=peers, y=speed, group=Implementation)) +
	#geom_line(aes(color=Implementation)) +
	stat_summary(aes(fill = Implementation), geom = 'ribbon', fun.data = mean_cl_normal, fun.args = list(conf.int=0.95), alpha = 0.5) +
	stat_summary(aes(y = speed, color = Implementation), fun.y = mean, geom = 'line') +
	theme_bw(base_size=14) +
	#scale_fill_brewer(palette = 'Set2') +
	#scale_y_log10() +
	#scale_y_continuous(labels=f2si) +
	#scale_y_continuous(labels=format_si()) +
	xlab("Number of Peers/Clients") +
	ylab("Mean Server Traffic (KB/s)") +
	theme(
		#panel.grid.major = element_line(colour = "white"),
		#panel.grid.minor = element_line(colour = "white"),
		axis.text        = element_text(size = 28),
		#axis.text.x      = element_text(angle = 90, hjust = 1, vjust = 0.5),
		#axis.title      = element_text(size = 20, face="bold")
		axis.title       = element_text(size = 30),
		legend.text      = element_text(size = 30),
		legend.title     = element_text(size = 30),
		legend.position  = c(0.25, 0.75)
	)

ggsave('traffic.pdf', width = 12)
