import { Link, type Href } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Action = {
  href: Href;
  label: string;
};

type ScreenScaffoldProps = {
  title: string;
  description: string;
  sections?: string[];
  actions?: Action[];
  children?: ReactNode;
};

export function ScreenScaffold({
  title,
  description,
  sections = [],
  actions = [],
  children,
}: ScreenScaffoldProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>KundaliKonnect Scaffold</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      {sections.length > 0 ? (
        <View style={styles.sectionWrap}>
          {sections.map((item) => (
            <View key={item} style={styles.chip}>
              <Text style={styles.chipText}>{item}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {children}

      {actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((action) => (
            <Link key={action.href + action.label} href={action.href} asChild>
              <Pressable style={styles.button}>
                <Text style={styles.buttonText}>{action.label}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 80,
    paddingBottom: 24,
    gap: 24,
    backgroundColor: '#F7F5F0',
  },
  header: {
    gap: 10,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#7B6E63',
    fontWeight: '700',
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    color: '#2D241E',
    fontWeight: '800',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5D5046',
  },
  sectionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    backgroundColor: '#EFE8E0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    color: '#4B3D34',
    fontWeight: '600',
    fontSize: 13,
  },
  actions: {
    marginTop: 'auto',
    gap: 10,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#2D241E',
  },
  buttonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 15,
  },
});
